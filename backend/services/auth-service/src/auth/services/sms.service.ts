import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_SMS_API_URL = 'https://bulkpush.mytoday.com/BulkSms/SingleMsgApi';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The OTP text registered with the operator (DLT). Only the code is a variable: any other change
 * to the wording, including the "5 minutes", gets the message rejected, so OTP_TTL_SECONDS
 * should stay at 300 while this template is in use.
 */
function otpMessage(otp: string): string {
  return `Dear User, ${otp} is your OTP for logging into App Name valid for 5 minutes. Please do not share this OTP with anyone. Thanks, Max Healthcare`;
}

/**
 * Sends OTPs through the Max Healthcare bulk SMS gateway (mytoday / BulkPush, SingleMsgApi).
 *
 * The gateway takes its credentials in the query string, so the URL is never logged, and the
 * default is the HTTPS endpoint so they do not cross the network in clear text.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['SMS_FEED_ID', 'SMS_USERNAME', 'SMS_PASSWORD', 'SMS_SENDER_ID'].every((key) =>
      Boolean(this.config.get<string>(key)),
    );
  }

  async sendOtp(mobile: string, otp: string): Promise<void> {
    const params: Record<string, string> = {
      feedid: this.config.getOrThrow<string>('SMS_FEED_ID'),
      password: this.config.getOrThrow<string>('SMS_PASSWORD'),
      senderid: this.config.getOrThrow<string>('SMS_SENDER_ID'),
      Text: otpMessage(otp),
      To: mobile,
      username: this.config.getOrThrow<string>('SMS_USERNAME'),
    };
    // encodeURIComponent rather than URLSearchParams: spaces go out as %20, exactly as the
    // provider's own sample request does, instead of `+`.
    const query = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    const url = `${this.config.get<string>('SMS_API_URL') || DEFAULT_SMS_API_URL}?${query}`;

    let status: number;
    let body: string;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      status = response.status;
      body = await response.text();
    } catch (error) {
      this.logFailure({ reason: error instanceof Error ? error.name : 'UnknownError' });
      throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
    }

    // The gateway answers errors with HTTP 200 and a <REQUEST-ERROR><ERROR> block.
    if (status >= 400 || /<ERROR\b/i.test(body)) {
      this.logFailure({
        code: /<CODE>([^<]*)<\/CODE>/i.exec(body)?.[1]?.trim(),
        description: /<DESC>([^<]*)<\/DESC>/i.exec(body)?.[1]?.trim(),
        status,
      });
      throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
    }
  }

  private logFailure(details: Record<string, unknown>): void {
    this.logger.error(JSON.stringify({ event: 'sms_otp_send_failed', ...details }));
  }
}
