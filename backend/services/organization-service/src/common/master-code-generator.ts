import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

interface SequenceRow {
  nextValue: bigint;
}

export async function getNextSequenceNumber(
  client: Prisma.TransactionClient,
  sequenceName: 'store_code_sequence' | 'kitchen_code_sequence' | 'restaurant_code_sequence',
): Promise<number> {
  const rows = await client.$queryRawUnsafe<SequenceRow[]>(
    `SELECT nextval('${sequenceName}')::bigint AS "nextValue"`,
  );
  const nextValue = rows[0]?.nextValue;
  const sequenceNumber = typeof nextValue === 'bigint' ? Number(nextValue) : Number(nextValue ?? 0);

  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 1) {
    throw new InternalServerErrorException('Unable to generate master code');
  }

  return sequenceNumber;
}

export function formatMasterCode(prefix: string, value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ConflictException('Invalid master code sequence value');
  }

  return `${prefix}${String(value).padStart(4, '0')}`;
}
