import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnlinePaymentStatus, type OnlinePayment } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { toNumber } from '../common/values';
import type { StartOnlinePaymentDto } from './dto/pos.dto';
import {
  findCardMachine,
  paymentProviders,
  pinelabs,
  plutusBaseUrl,
  providerLabels,
  type PaymentProvider,
} from './online-payment-providers';
import { PosService } from './pos.service';

function toView(payment: OnlinePayment) {
  return {
    amount: toNumber(payment.amount),
    id: payment.id,
    paidReference: payment.paidReference,
    paymentUrl: payment.paymentUrl,
    provider: payment.provider,
    status: payment.status,
  };
}

/**
 * Payments taken online at the till: UPI through Razorpay or PayU as the cashier picks, or a card
 * on the counter's Pine Labs machine. The amount is the bill's, priced here from the menu; the
 * till shows the provider's link as a QR (or the machine shows the amount) and checks it until
 * paid, then bills with it (PosService.createOrder takes it once, for that amount only).
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly providers: Map<OnlinePayment['provider'], PaymentProvider>;
  /** Pine Labs' Plutus Cloud API; unset, card machines are not offered. */
  private readonly plutusUrl: string;

  constructor(
    config: ConfigService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
    private readonly auditLog?: AuditLogService,
  ) {
    this.providers = paymentProviders(config);
    this.plutusUrl = plutusBaseUrl(config);
  }

  /** The UPI providers set up here, in the order the cashier sees them. */
  available() {
    return [...this.providers.keys()];
  }

  /** The counter's Pine Labs card machine the till offers for cards, or null when it has none. */
  async cardMachine(counterId: string) {
    const machine = await this.findCardMachine({ counterId });

    return machine ? { name: machine.name } : null;
  }

  async start(dto: StartOnlinePaymentDto, context: ActorContext) {
    const machine =
      dto.provider === 'PINELABS' && this.plutusUrl
        ? await this.findCardMachine({ counterId: dto.counterId })
        : null;
    const provider = machine ? pinelabs(this.plutusUrl, machine) : this.providers.get(dto.provider);

    if (dto.provider === 'PINELABS' && this.plutusUrl && !machine) {
      throw new BadRequestException(
        'This counter has no Pine Labs card machine. Add its Pine Labs details under POS & Payment Machines.',
      );
    }

    if (!provider) {
      throw new BadRequestException(`${providerLabels[dto.provider]} is not set up here.`);
    }

    const counter = await this.pos.findCounter(dto.counterId);
    const { grandTotal } = await this.pos.quoteBill(counter, dto);

    if (grandTotal <= 0) {
      throw new BadRequestException('There is nothing to pay on this bill.');
    }

    const id = randomUUID();
    const link = await provider.create({
      amount: grandTotal,
      description: `${counter.restaurant.restaurantName} · ${counter.counterName}`,
      reference: id,
    });

    const created = toView(
      await this.prisma.onlinePayment.create({
        data: {
          amount: grandTotal,
          counterId: counter.id,
          createdBy: context.actorId ?? null,
          hospitalId: counter.hospitalId,
          id,
          paymentMachineId: machine?.id ?? null,
          paymentUrl: link.paymentUrl,
          provider: dto.provider,
          providerRef: link.providerRef,
        },
      }),
    );

    void this.auditLog?.record({
      action: 'CREATE',
      actorId: context.actorId,
      entityId: id,
      entityName: 'online_payments',
      hospitalId: counter.hospitalId,
      newValue: {
        amount: grandTotal,
        counterId: counter.id,
        provider: created.provider,
        status: created.status,
      },
      summary: `${created.provider} payment of ${grandTotal} started`,
    });

    return created;
  }

  /** Asks the provider while it is pending; paid or closed, it is settled for good. */
  async check(id: string) {
    const payment = await this.find(id);
    const provider = await this.providerFor(payment);

    if (payment.status !== OnlinePaymentStatus.PENDING || !provider) {
      return toView(payment);
    }

    const state = await provider.read(payment.providerRef);

    if (!state.paid && !state.closed) {
      return toView(payment);
    }

    // Only a pending one moves: two tills checking at once settle it the same way, once.
    const settled = await this.prisma.onlinePayment.updateMany({
      data: state.paid
        ? { paidAt: new Date(), paidReference: state.reference, status: OnlinePaymentStatus.PAID }
        : { status: OnlinePaymentStatus.EXPIRED },
      where: { id, status: OnlinePaymentStatus.PENDING },
    });

    if (settled.count === 1) {
      this.recordStatusChange(
        payment,
        state.paid ? OnlinePaymentStatus.PAID : OnlinePaymentStatus.EXPIRED,
      );
    }

    return toView(await this.find(id));
  }

  /** Lets an unpaid one go. If the guest paid meanwhile, it comes back PAID for the till to bill. */
  async cancel(id: string) {
    const checked = await this.check(id);

    if (checked.status !== OnlinePaymentStatus.PENDING) {
      return checked;
    }

    const payment = await this.find(id);

    try {
      await (
        await this.providerFor(payment)
      )?.cancel(payment.providerRef, toNumber(payment.amount));
    } catch {
      // Refused (paid a moment ago, say): what the provider says now decides.
      return this.check(id);
    }

    const cancelled = await this.prisma.onlinePayment.updateMany({
      data: { status: OnlinePaymentStatus.CANCELLED },
      where: { id, status: OnlinePaymentStatus.PENDING },
    });

    if (cancelled.count === 1) {
      this.recordStatusChange(payment, OnlinePaymentStatus.CANCELLED);
    }

    return toView(await this.find(id));
  }

  /** Saved in the background: settling a payment never waits on, or fails with, its audit row. */
  private recordStatusChange(payment: OnlinePayment, status: OnlinePaymentStatus): void {
    void this.auditLog?.record({
      action: 'STATUS_CHANGE',
      entityId: payment.id,
      entityName: 'online_payments',
      hospitalId: payment.hospitalId,
      newValue: { status },
      oldValue: { status: payment.status },
      summary: `${payment.provider} payment of ${toNumber(payment.amount)} ${status.toLowerCase()}`,
    });
  }

  /** Who to ask about a payment: a Pine Labs one goes back to the machine it was sent to. */
  private async providerFor(payment: OnlinePayment) {
    if (payment.provider !== 'PINELABS') {
      return this.providers.get(payment.provider);
    }

    const machine =
      this.plutusUrl && payment.paymentMachineId
        ? await this.findCardMachine({ id: payment.paymentMachineId })
        : null;

    return machine ? pinelabs(this.plutusUrl, machine) : undefined;
  }

  private findCardMachine(by: { counterId: string } | { id: string }) {
    return findCardMachine(this.prisma, this.plutusUrl, by);
  }

  private async find(id: string) {
    const payment = await this.prisma.onlinePayment.findFirst({ where: { id } });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }
}
