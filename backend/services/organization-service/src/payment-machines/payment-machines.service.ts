import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../common/audit/audit-log.service';
import { getPageMeta, getPagination } from '../common/pagination';
import type { ActorContext } from '../common/request-context';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import {
  ListPaymentMachinesQueryDto,
  PaymentMachineSortField,
} from './dto/list-payment-machines-query.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';
import {
  PaymentMachinesRepository,
  PaymentMachineWithRelations,
} from './payment-machines.repository';

type PaymentMachineClient = Prisma.TransactionClient;

function maskSecret(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return `••••${value.slice(-4)}`;
}

function toPaymentMachineResponse(paymentMachine: PaymentMachineWithRelations) {
  return {
    createdAt: paymentMachine.createdAt,
    deletedAt: paymentMachine.deletedAt,
    hasPinelabSecurityToken: Boolean(paymentMachine.pinelabSecurityToken),
    hospital: {
      hospitalCode: paymentMachine.hospital.hospitalCode,
      hospitalName: paymentMachine.hospital.hospitalName,
      id: paymentMachine.hospital.id,
      isActive: paymentMachine.hospital.isActive,
    },
    hospitalId: paymentMachine.hospitalId,
    id: paymentMachine.id,
    isActive: paymentMachine.isActive,
    isDefault: paymentMachine.isDefault,
    name: paymentMachine.name,
    pinelabImei: paymentMachine.pinelabImei,
    pinelabMerchantId: paymentMachine.pinelabMerchantId,
    pinelabMerchantStorePosCode: paymentMachine.pinelabMerchantStorePosCode,
    pinelabSecurityToken: maskSecret(paymentMachine.pinelabSecurityToken),
    posDevice: {
      code: paymentMachine.posDevice.code,
      id: paymentMachine.posDevice.id,
      isActive: paymentMachine.posDevice.isActive,
      name: paymentMachine.posDevice.name,
    },
    posDeviceId: paymentMachine.posDeviceId,
    primaryUpi: paymentMachine.primaryUpi,
    serialNumber: paymentMachine.serialNumber,
    updatedAt: paymentMachine.updatedAt,
  };
}

function getPaymentMachineOrderBy(
  query: ListPaymentMachinesQueryDto,
): Prisma.PaymentMachineOrderByWithRelationInput {
  const sortBy: PaymentMachineSortField = query.sortBy ?? 'createdAt';

  return {
    [sortBy]: query.sortOrder ?? 'desc',
  };
}

@Injectable()
export class PaymentMachinesService {
  constructor(
    private readonly auditLog: AuditLogService,
    private readonly paymentMachines: PaymentMachinesRepository,
  ) {}

  async list(query: ListPaymentMachinesQueryDto) {
    const { limit, page } = getPagination(query);
    const where: Prisma.PaymentMachineWhereInput = {
      deletedAt: null,
      hospital: {
        deletedAt: null,
      },
      posDevice: {
        deletedAt: null,
      },
      ...(query.hospitalId ? { hospitalId: query.hospitalId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isDefault !== undefined ? { isDefault: query.isDefault } : {}),
      ...(query.posDeviceId ? { posDeviceId: query.posDeviceId } : {}),
      ...(query.primaryUpi ? { primaryUpi: query.primaryUpi } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { serialNumber: { contains: query.search, mode: 'insensitive' } },
              { pinelabMerchantId: { contains: query.search, mode: 'insensitive' } },
              { pinelabImei: { contains: query.search, mode: 'insensitive' } },
              { hospital: { hospitalName: { contains: query.search, mode: 'insensitive' } } },
              { posDevice: { code: { contains: query.search, mode: 'insensitive' } } },
              { posDevice: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.paymentMachines.findMany({
        orderBy: getPaymentMachineOrderBy(query),
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.paymentMachines.count({ where }),
    ]);

    return {
      items: items.map(toPaymentMachineResponse),
      meta: getPageMeta(page, limit, total),
    };
  }

  async getById(id: string) {
    return toPaymentMachineResponse(await this.findActivePaymentMachine(id));
  }

  async create(dto: CreatePaymentMachineDto, context: ActorContext) {
    try {
      const created = await this.paymentMachines.transaction(async (tx) => {
        await this.assertActiveHospital(dto.hospitalId, tx);
        await this.assertActivePosDevice(dto.posDeviceId, dto.hospitalId, tx);

        const isDefault = dto.isDefault ?? false;

        if (isDefault) {
          await this.releaseCurrentDefault(dto.posDeviceId, undefined, context, tx);
        }

        const paymentMachine = await this.paymentMachines.create(
          {
            createdBy: context.actorId,
            hospitalId: dto.hospitalId,
            isActive: dto.isActive ?? true,
            isDefault,
            name: dto.name,
            pinelabImei: dto.pinelabImei,
            pinelabMerchantId: dto.pinelabMerchantId,
            pinelabMerchantStorePosCode: dto.pinelabMerchantStorePosCode,
            // Local dev configuration only; production should move this to Key Vault/encrypted storage.
            pinelabSecurityToken: dto.pinelabSecurityToken,
            posDeviceId: dto.posDeviceId,
            primaryUpi: dto.primaryUpi,
            serialNumber: dto.serialNumber,
            updatedBy: context.actorId,
          },
          tx,
        );

        await this.auditLog.record(
          {
            action: 'PAYMENT_MACHINE_CREATE',
            actorId: context.actorId,
            entityId: paymentMachine.id,
            entityName: 'payment_machines',
            hospitalId: paymentMachine.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toPaymentMachineResponse(paymentMachine),
          },
          tx,
        );

        return paymentMachine;
      });

      return toPaymentMachineResponse(created);
    } catch (error) {
      this.handlePrismaError(error, 'Payment machine');
    }
  }

  async update(id: string, dto: UpdatePaymentMachineDto, context: ActorContext) {
    try {
      const updated = await this.paymentMachines.transaction(async (tx) => {
        const existing = await this.findActivePaymentMachine(id, tx);
        const hospitalId = dto.hospitalId ?? existing.hospitalId;
        const posDeviceId = dto.posDeviceId ?? existing.posDeviceId;
        const data: Prisma.PaymentMachineUpdateInput = {};

        if (dto.hospitalId !== undefined) {
          await this.assertActiveHospital(dto.hospitalId, tx);
          data.hospital = {
            connect: {
              id: dto.hospitalId,
            },
          };
        }

        if (dto.hospitalId !== undefined || dto.posDeviceId !== undefined) {
          await this.assertActivePosDevice(posDeviceId, hospitalId, tx);
        }

        if (dto.isActive !== undefined) {
          data.isActive = dto.isActive;
        }

        if (dto.isDefault !== undefined) {
          if (dto.isDefault) {
            await this.releaseCurrentDefault(posDeviceId, id, context, tx);
          }

          data.isDefault = dto.isDefault;
        } else if (dto.posDeviceId !== undefined && existing.isDefault) {
          // Moving a default machine to another POS device must not leave two defaults behind.
          await this.releaseCurrentDefault(posDeviceId, id, context, tx);
        }

        if (dto.name !== undefined) {
          data.name = dto.name;
        }

        if (dto.pinelabImei !== undefined) {
          data.pinelabImei = dto.pinelabImei;
        }

        if (dto.pinelabMerchantId !== undefined) {
          data.pinelabMerchantId = dto.pinelabMerchantId;
        }

        if (dto.pinelabMerchantStorePosCode !== undefined) {
          data.pinelabMerchantStorePosCode = dto.pinelabMerchantStorePosCode;
        }

        if (dto.pinelabSecurityToken !== undefined) {
          data.pinelabSecurityToken = dto.pinelabSecurityToken;
        }

        if (dto.posDeviceId !== undefined) {
          data.posDevice = {
            connect: {
              id: dto.posDeviceId,
            },
          };
        }

        if (dto.primaryUpi !== undefined) {
          data.primaryUpi = dto.primaryUpi;
        }

        if (dto.serialNumber !== undefined) {
          data.serialNumber = dto.serialNumber;
        }

        if (Object.keys(data).length > 0) {
          data.updatedBy = context.actorId;
        }

        const paymentMachine = Object.keys(data).length
          ? await this.paymentMachines.update(id, data, tx)
          : existing;

        await this.auditLog.record(
          {
            action:
              dto.isActive !== undefined && dto.isActive !== existing.isActive
                ? 'PAYMENT_MACHINE_STATUS_CHANGE'
                : 'PAYMENT_MACHINE_UPDATE',
            actorId: context.actorId,
            entityId: id,
            entityName: 'payment_machines',
            hospitalId: paymentMachine.hospitalId,
            ipAddress: context.ipAddress,
            newValue: toPaymentMachineResponse(paymentMachine),
            oldValue: toPaymentMachineResponse(existing),
          },
          tx,
        );

        return paymentMachine;
      });

      return toPaymentMachineResponse(updated);
    } catch (error) {
      this.handlePrismaError(error, 'Payment machine');
    }
  }

  async remove(id: string, context: ActorContext) {
    const existing = await this.findActivePaymentMachine(id);

    await this.paymentMachines.transaction(async (tx) => {
      await this.paymentMachines.update(
        id,
        {
          deletedAt: new Date(),
          isActive: false,
          isDefault: false,
          updatedBy: context.actorId,
        },
        tx,
      );
      await this.auditLog.record(
        {
          action: 'PAYMENT_MACHINE_DELETE',
          actorId: context.actorId,
          entityId: id,
          entityName: 'payment_machines',
          hospitalId: existing.hospitalId,
          ipAddress: context.ipAddress,
          oldValue: toPaymentMachineResponse(existing),
        },
        tx,
      );
    });

    return { id };
  }

  private async assertActiveHospital(id: string, client: PaymentMachineClient): Promise<void> {
    const hospital = await this.paymentMachines.findActiveHospital(id, client);

    if (!hospital || !hospital.isActive) {
      throw new BadRequestException('Location not found or inactive');
    }
  }

  private async assertActivePosDevice(
    id: string,
    hospitalId: string,
    client: PaymentMachineClient,
  ): Promise<void> {
    const posDevice = await this.paymentMachines.findActivePosDevice(id, hospitalId, client);

    if (!posDevice) {
      throw new BadRequestException('POS device not found for selected location');
    }
  }

  /**
   * BA rule (Menu 2 validations): only one live payment machine per POS device can be the default.
   * Setting a new default demotes the previous one inside the same transaction so the grid toggle
   * behaves like a radio choice rather than failing the save.
   */
  private async releaseCurrentDefault(
    posDeviceId: string,
    excludeId: string | undefined,
    context: ActorContext,
    client: PaymentMachineClient,
  ): Promise<void> {
    const currentDefaults = await this.paymentMachines.findDefaultsForPosDevice(
      posDeviceId,
      excludeId,
      client,
    );

    for (const currentDefault of currentDefaults) {
      const demoted = await this.paymentMachines.update(
        currentDefault.id,
        {
          isDefault: false,
          updatedBy: context.actorId,
        },
        client,
      );

      await this.auditLog.record(
        {
          action: 'PAYMENT_MACHINE_DEFAULT_CHANGE',
          actorId: context.actorId,
          entityId: currentDefault.id,
          entityName: 'payment_machines',
          hospitalId: currentDefault.hospitalId,
          ipAddress: context.ipAddress,
          newValue: toPaymentMachineResponse(demoted),
          oldValue: toPaymentMachineResponse(currentDefault),
        },
        client,
      );
    }
  }

  private async findActivePaymentMachine(
    id: string,
    client?: PaymentMachineClient,
  ): Promise<PaymentMachineWithRelations> {
    const paymentMachine = await this.paymentMachines.findActiveById(id, client);

    if (!paymentMachine) {
      throw new NotFoundException('Payment machine not found');
    }

    return paymentMachine;
  }

  private handlePrismaError(error: unknown, entityName: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(`${entityName} already exists`);
    }

    throw error;
  }
}
