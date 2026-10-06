import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** A unique-constraint violation becomes a 409 "<entity> already exists"; anything else rethrows. */
export function handlePrismaError(error: unknown, entityName: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(`${entityName} already exists`);
  }

  throw error;
}
