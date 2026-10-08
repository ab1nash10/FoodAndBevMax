import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getAllowedHospitalIds } from '@aahar/auth';
import type { Prisma } from '@prisma/client';

/**
 * Items, item categories, time slots and employees either belong to one location (hospitalId)
 * or, with no hospitalId, are shared by every location.
 */

/** The location summary returned with each of these records. */
export const masterHospitalSelect = {
  select: { hospitalCode: true, hospitalName: true, id: true, isActive: true },
} as const;

/** The records a location works with: the shared ones plus its own. */
export function sharedOrAt(hospitalId: string): { OR: Array<{ hospitalId: string | null }> } {
  return { OR: [{ hospitalId: null }, { hospitalId }] };
}

/** Only a user who reaches every location may add, change or remove a shared record. */
export function assertMayChangeShared(hospitalId: string | null | undefined, what: string): void {
  // The request's allowed locations are a list only for users limited to some locations.
  if (!hospitalId && Array.isArray(getAllowedHospitalIds())) {
    throw new ForbiddenException(`Only a Super Admin can change ${what} shared by every location`);
  }
}

/** A location's own record may be used only at that location; a shared one anywhere. */
export function assertUsableAt(
  record: { hospitalId: string | null },
  hospitalId: string | null,
  what: string,
): void {
  if (record.hospitalId === null || record.hospitalId === hospitalId) {
    return;
  }

  throw new BadRequestException(
    hospitalId
      ? `This ${what} belongs to another location`
      : `This ${what} belongs to one location, so a record shared by every location cannot use it`,
  );
}

export async function assertActiveHospital(
  client: Prisma.TransactionClient,
  hospitalId: string,
): Promise<void> {
  const hospital = await client.hospital.findFirst({
    select: { isActive: true },
    where: { deletedAt: null, id: hospitalId },
  });

  if (!hospital?.isActive) {
    throw new BadRequestException('Location not found or inactive');
  }
}

/** Refuses giving a record to one location while it is still used at another. */
export function assertNotUsedElsewhere(uses: number, what: string): void {
  if (uses > 0) {
    throw new BadRequestException(
      `This ${what} is used at other locations, so it cannot be given to just this one`,
    );
  }
}
