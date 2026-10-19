import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

const entityOf = {
  hospital: { select: { legalEntity: { select: { entityName: true, id: true } } } },
  legalEntity: { select: { entityName: true, id: true } },
} satisfies Prisma.PosDeviceSelect;

type WithEntity = Prisma.PosDeviceGetPayload<{ select: typeof entityOf }>;

/** The entity something bills under: its own, else its location's; null when neither has one. */
function effectiveEntity(record: WithEntity): { entityName: string; id: string } | null {
  return record.legalEntity ?? record.hospital.legalEntity ?? null;
}

/**
 * One POS device bills for one legal entity: every restaurant it serves must belong to the same
 * entity (a restaurant or device without one of its own counts as its location's). GST invoices
 * and the payment machine's merchant account are per entity, so a counter billing for two
 * entities needs two POS devices.
 *
 * Run inside the transaction after a change is written, on the links it can affect: a conflict
 * throws and the whole change rolls back.
 */
export async function assertPosEntitiesMatch(
  tx: Prisma.TransactionClient,
  links: Prisma.PosDeviceRestaurantWhereInput,
): Promise<void> {
  const active = await tx.posDeviceRestaurant.findMany({
    select: {
      posDevice: { select: { ...entityOf, name: true } },
      restaurant: { select: { ...entityOf, restaurantName: true } },
    },
    where: {
      AND: [
        links,
        {
          deletedAt: null,
          isActive: true,
          posDevice: { deletedAt: null },
          restaurant: { deletedAt: null },
        },
      ],
    },
  });
  const conflict = active.find(
    ({ posDevice, restaurant }) =>
      (effectiveEntity(posDevice)?.id ?? null) !== (effectiveEntity(restaurant)?.id ?? null),
  );

  if (conflict) {
    const name = (record: WithEntity) => effectiveEntity(record)?.entityName ?? 'no legal entity';

    throw new BadRequestException(
      `POS device ${conflict.posDevice.name} bills under ${name(conflict.posDevice)}, but ` +
        `${conflict.restaurant.restaurantName} belongs to ${name(conflict.restaurant)}. A POS ` +
        'device can only serve restaurants of its own legal entity; use a separate POS device ' +
        'for this restaurant.',
    );
  }
}
