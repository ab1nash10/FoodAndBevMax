import { randomBytes, randomUUID } from 'node:crypto';
import { sha256 } from '../pos/staff-discount-confirm';

type Raw = (sql: string, ...values: unknown[]) => Promise<unknown>;

/**
 * A till's staff discount, confirmed as if the employee had read out the code sent to their mobile
 * (pos.int.spec covers that path itself): the token one bill uses up.
 */
export async function staffToken(
  rawQuery: Raw,
  employeeCode: string,
  restaurantId: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await rawQuery(
    `INSERT INTO staff_discount_otps
       (id, employee_code, restaurant_id, code_hash, expires_at, verified_at, token_hash)
     VALUES ($1::uuid, $2, $3::uuid, '', now() + interval '15 minutes', now(), $4)`,
    randomUUID(),
    employeeCode,
    restaurantId,
    sha256(token),
  );

  return token;
}
