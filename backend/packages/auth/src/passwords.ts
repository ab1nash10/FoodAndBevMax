import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { N: scryptCost, p: scryptParallelization, r: scryptBlockSize },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return [
    'scrypt',
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] =
    encodedHash.split('$');

  if (
    algorithm !== 'scrypt' ||
    !encodedSalt ||
    !encodedKey ||
    Number(cost) !== scryptCost ||
    Number(blockSize) !== scryptBlockSize ||
    Number(parallelization) !== scryptParallelization
  ) {
    return false;
  }

  const expectedKey = Buffer.from(encodedKey, 'base64url');
  const actualKey = await deriveKey(password, Buffer.from(encodedSalt, 'base64url'));

  return expectedKey.length === actualKey.length && timingSafeEqual(expectedKey, actualKey);
}
