import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, test } from 'vitest';
import { handlePrismaError } from './prisma-errors';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { clientVersion: 'test', code });

describe('handlePrismaError', () => {
  test('a unique violation is a 409 naming the entity', () => {
    const thrown = (() => {
      try {
        handlePrismaError(prismaError('P2002'), 'Counter');
      } catch (error) {
        return error;
      }
    })();

    expect(thrown).toBeInstanceOf(ConflictException);
    expect((thrown as ConflictException).getStatus()).toBe(409);
    expect((thrown as ConflictException).message).toBe('Counter already exists');
  });

  test('any other error is rethrown unchanged', () => {
    const notFound = prismaError('P2025');
    const plain = new Error('boom');

    expect(() => handlePrismaError(notFound, 'Counter')).toThrow(notFound);
    expect(() => handlePrismaError(plain, 'Counter')).toThrow(plain);
  });
});
