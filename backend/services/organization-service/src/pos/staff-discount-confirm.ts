import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

// Its own file: PosService uses it, and StaffDiscountOtpService (which needs PosService) makes the
// tokens, so either importing the other would be a cycle.
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const unconfirmedStaffDiscount =
  'The staff discount needs the code sent to the employee’s mobile. Send it, then enter it.';

/**
 * Checks (and, for the bill, uses up) a till's staff discount confirmation: the token the till got
 * once the employee read out the code sent to their mobile, for this employee at this restaurant.
 * Used up in the bill's own transaction, so a bill that fails leaves it for the retry.
 */
export async function confirmStaffDiscount(
  client: Pick<Prisma.TransactionClient, 'staffDiscountOtp'>,
  input: { employeeCode: string; restaurantId: string; token: string | undefined },
  useUp: boolean,
): Promise<void> {
  const where: Prisma.StaffDiscountOtpWhereInput = {
    employeeCode: { equals: input.employeeCode, mode: 'insensitive' },
    expiresAt: { gt: new Date() },
    restaurantId: input.restaurantId,
    tokenHash: sha256(input.token ?? ''),
  };
  const found = !input.token
    ? 0
    : useUp
      ? (await client.staffDiscountOtp.updateMany({ data: { tokenHash: null }, where })).count
      : await client.staffDiscountOtp.count({ where });

  if (found !== 1) throw new BadRequestException(unconfirmedStaffDiscount);
}
