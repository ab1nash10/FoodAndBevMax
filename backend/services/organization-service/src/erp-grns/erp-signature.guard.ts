import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAX_CLOCK_SKEW_MS,
  parseErpTimestamp,
  sign,
  signatureMatches,
  stringToSign,
} from './erp-signature';

interface HeaderRequest {
  header(name: string): string | undefined;
}

/**
 * Lets in only requests signed by the ERP, in the EAM team's format: the API key, then
 * X-Timestamp within 5 minutes, then X-Signature = SHA-512 of api_key|GRN|X-Timestamp|token
 * (ERP_API_SECRET is the token). The token itself never travels. The signature covers neither the
 * body nor a one-time number, so a captured request works again while its timestamp is valid:
 * only HTTPS keeps the headers private.
 */
@Injectable()
export class ErpSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HeaderRequest>();
    const apiKey = this.config.get<string>('ERP_API_KEY');
    const token = this.config.get<string>('ERP_API_SECRET');

    if (!apiKey || !token) {
      throw new ServiceUnavailableException('ERP access is not set up on this server');
    }

    const header = (name: string) => request.header(name) ?? '';
    const timestamp = header('x-timestamp');

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

    if (!signatureMatches(sign(stringToSign(apiKey, timestamp, token)), header('x-signature'))) {
      throw new UnauthorizedException('Signature does not match');
    }

    return true;
  }
}

/** Constant time whatever the lengths: both sides are hashed to 32 bytes first. */
function sameText(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();

  return timingSafeEqual(digest(given), digest(expected));
}
