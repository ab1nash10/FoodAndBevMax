import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** GSTIN: state code, PAN, entity number, the letter Z, check character. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The GST number as stored: no spaces, capital letters; refused unless it is a valid GSTIN. */
export function normalizeGstNumber(value: string): string {
  const gstNumber = value.replace(/\s+/g, '').toUpperCase();

  if (!GSTIN_PATTERN.test(gstNumber)) {
    throw new BadRequestException('Enter a valid 15-character GST number, e.g. 07AADCM0815B1ZQ');
  }

  return gstNumber;
}

/** A location or restaurant may only be linked to an entity that exists and is active. */
export async function assertActiveLegalEntity(
  client: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  const entity = await client.legalEntity.findFirst({
    select: { id: true },
    where: { deletedAt: null, id, isActive: true },
  });

  if (!entity) {
    throw new BadRequestException('Choose an active entity');
  }
}
