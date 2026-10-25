import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnlinePaymentStatus, type OnlinePayment } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ActorContext } from '../common/request-context';
import { toNumber } from '../common/values';
import type { StartOnlinePaymentDto } from './dto/pos.dto';
import { paymentProviders, providerLabels, type PaymentProvider } from './online-payment-providers';
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
 * UPI taken online at the till, through Razorpay or PayU as the cashier picks. The amount is the
 * bill's, priced here from the menu; the till shows the provider's link as a QR and checks it
 * until paid, then bills with it (PosService.createOrder takes it once, for that amount only).
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly providers: Map<OnlinePayment['provider'], PaymentProvider>;

  constructor(
    config: ConfigService,
    private readonly pos: PosService,
    private readonly prisma: PrismaService,
  ) {
    this.providers = paymentProviders(config);
  }

  /** The providers set up here, in the order the cashier sees them. */
  available() {
    return [...this.providers.keys()];
  }

  async start(dto: StartOnlinePaymentDto, context: ActorContext) {
    const provider = this.providers.get(dto.provider);

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

    return toView(
      await this.prisma.onlinePayment.create({
        data: {
          amount: grandTotal,
          counterId: counter.id,
          createdBy: context.actorId ?? null,
          hospitalId: counter.hospitalId,
          id,
          paymentUrl: link.paymentUrl,
          provider: dto.provider,
          providerRef: link.providerRef,
        },
      }),
    );
  }

  /** Asks the provider while it is pending; paid or closed, it is settled for good. */
  async check(id: string) {
    const payment = await this.find(id);
    const provider = this.providers.get(payment.provider);

    if (payment.status !== OnlinePaymentStatus.PENDING || !provider) {
      return toView(payment);
    }

    const state = await provider.read(payment.providerRef);

    if (!state.paid && !state.closed) {
      return toView(payment);
    }

    // Only a pending one moves: two tills checking at once settle it the same way, once.
    await this.prisma.onlinePayment.updateMany({
      data: state.paid
        ? { paidAt: new Date(), paidReference: state.reference, status: OnlinePaymentStatus.PAID }
        : { status: OnlinePaymentStatus.EXPIRED },
      where: { id, status: OnlinePaymentStatus.PENDING },
    });

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
      await this.providers.get(payment.provider)?.cancel(payment.providerRef);
    } catch {
      // Refused (paid a moment ago, say): what the provider says now decides.
      return this.check(id);
    }

    await this.prisma.onlinePayment.updateMany({
      data: { status: OnlinePaymentStatus.CANCELLED },
      where: { id, status: OnlinePaymentStatus.PENDING },
    });

    return toView(await this.find(id));
  }

  private async find(id: string) {
    const payment = await this.prisma.onlinePayment.findFirst({ where: { id } });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }
}
