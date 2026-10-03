/**
 * Sets a user's sign-in password, hashed into their user record, overwriting any existing one.
 *
 * The seed gives the Super Admin its first password from ADMIN_PASSWORD (prisma/seed.ts); this is
 * how to replace it, or to recover an account whose password is lost.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<strong password>' pnpm admin:password
 *
 * The password is read from the environment rather than argv so it does not end up in shell
 * history or in the process list.
 */
import { hashPassword } from '../passwords';
import { createPrismaAdapter } from '../prisma-adapter';
import { PrismaClient, UserStatus } from '@prisma/client';

const MIN_PASSWORD_LENGTH = 8;

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD, e.g.\n' +
        "  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<strong password>' pnpm admin:password",
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must contain at least one letter and one number.');
  }

  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const user = await prisma.user.findFirst({
      select: { email: true, id: true, name: true, status: true },
      where: { deletedAt: null, email },
    });

    if (!user) {
      throw new Error(`No active user found with email ${email}.`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new Error(
        `${email} is ${user.status}; activate the account before setting a password.`,
      );
    }

    await prisma.user.update({
      data: { passwordHash: await hashPassword(password), updatedBy: user.id },
      where: { id: user.id },
    });

    console.log(`Password set for ${user.name} <${user.email}>.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
