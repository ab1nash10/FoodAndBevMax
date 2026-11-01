import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  MAX_CLOCK_SKEW_MS,
  parseErpTimestamp,
  sign,
  signatureMatches,
  stringToSign,
} from './erp-signature';

/** Nonces are kept a little longer than a timestamp stays valid, then dropped. */
const NONCE_KEEP_MS = 2 * MAX_CLOCK_SKEW_MS;

interface RawRequest {
  header(name: string): string | undefined;
  method: string;
  originalUrl: string;
  /** The body exactly as received; set because the app is created with rawBody: true. */
  rawBody?: Buffer;
}

/**
 * Lets in only requests signed by the ERP: the API key, then X-Timestamp within 5 minutes, then
 * the HMAC-SHA256 signature over the exact bytes received, then a nonce never seen before. The
 * secret itself never travels; a changed body, path or time fails the signature, and a captured
 * request cannot be sent again.
 */
@Injectable()
export class ErpSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawRequest>();
    const apiKey = this.config.get<string>('ERP_API_KEY');
    const secret = this.config.get<string>('ERP_API_SECRET');

    if (!apiKey || !secret) {
      throw new ServiceUnavailableException('ERP access is not set up on this server');
    }

    const header = (name: string) => request.header(name) ?? '';
    const timestamp = header('x-timestamp');
    const nonce = header('x-nonce');

    if (!sameText(header('x-api-key'), apiKey)) {
      throw new UnauthorizedException('Unknown API key');
    }

    const sentAt = parseErpTimestamp(timestamp);

    if (sentAt === null) {
      throw new UnauthorizedException('X-Timestamp must be dd/MM/yyyy/HH/mm in India time');
    }

    if (Math.abs(Date.now() - sentAt) > MAX_CLOCK_SKEW_MS) {
      throw new UnauthorizedException('X-Timestamp is more than 5 minutes from the server time');
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nonce)) {
      throw new UnauthorizedException('X-Nonce must be a UUID');
    }

    // originalUrl is the path as called, with the /fandb/api/v1 prefix and the query string.
    const text = stringToSign(
      request.method,
      request.originalUrl,
      timestamp,
      nonce,
      request.rawBody ?? Buffer.alloc(0),
    );

    if (!signatureMatches(sign(secret, text), header('x-signature'))) {
      throw new UnauthorizedException('Signature does not match');
    }

    // Last, so a request that fails a check above cannot use up a nonce.
    await this.prisma.erpRequestNonce.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - NONCE_KEEP_MS) } },
    });

    try {
      await this.prisma.erpRequestNonce.create({ data: { nonce: nonce.toLowerCase() } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UnauthorizedException('This request was already received');
      }

      throw error;
    }

    return true;
  }
}

/** Constant time whatever the lengths: both sides are hashed to 32 bytes first. */
function sameText(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();

  return timingSafeEqual(digest(given), digest(expected));
}
