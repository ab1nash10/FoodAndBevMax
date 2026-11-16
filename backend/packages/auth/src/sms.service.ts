import { logger } from '@aahar/logging';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_SMS_API_URL = 'https://iqsms.airtel.in/api/v1/send-sms';
const REQUEST_TIMEOUT_MS = 10_000;

// Max Healthcare's DLT registration. The template ID belongs to the exact wording below.
const DLT_ENTITY_ID = '1401730220000010116';
const DLT_TEMPLATE_ID = '1177179007636464708';

/**
 * The OTP text registered with the operator (DLT). Only the code is a variable: any other change
 * to the wording, including the "5 minutes", gets the message rejected, so OTP_TTL_SECONDS
 * should stay at 300 while this template is in use.
 */
function otpMessage(otp: string): string {
  return `Dear User, ${otp} is your OTP for logging into App Name valid for 5 minutes. Please do not share this OTP with anyone. Thanks, Max Healthcare`;
}

/**
 * Sends OTPs through Airtel IQ (send-sms API). SMS_USERNAME is the Airtel customer ID, which is
 * also the Basic-auth user; SMS_PASSWORD is its password.
 */
@Injectable()
export class SmsService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['SMS_USERNAME', 'SMS_PASSWORD', 'SMS_SENDER_ID'].every((key) =>
      Boolean(this.setting(key)),
    );
  }

  async sendOtp(mobile: string, otp: string): Promise<void> {
    const customerId = this.setting('SMS_USERNAME');
    const login = Buffer.from(`${customerId}:${this.setting('SMS_PASSWORD')}`).toString('base64');

    let status: number;
    let body: string;

    try {
      const response = await fetch(this.config.get<string>('SMS_API_URL') || DEFAULT_SMS_API_URL, {
        body: JSON.stringify({
          customerId,
          destinationAddress: mobile,
          dltTemplateId: DLT_TEMPLATE_ID,
          entityId: DLT_ENTITY_ID,
          message: otpMessage(otp),
          messageType: 'SERVICE_IMPLICIT',
          otp: true,
          sourceAddress: this.setting('SMS_SENDER_ID'),
        }),
        headers: { Authorization: `Basic ${login}`, 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = response.status;
      body = await response.text();
    } catch (error) {
      this.logFailure({ reason: error instanceof Error ? error.name : 'UnknownError' });
      throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
    }

    // A number Airtel will not text still gets HTTP 200, listed in incorrectNum.
    if (status >= 400 || /"incorrectNum"\s*:\s*\[\s*"/.test(body)) {
      // The reply may echo the message, so the code is masked before the body is logged.
      this.logFailure({ body: body.replaceAll(otp, '******').slice(0, 500), status });
      throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
    }
  }

  // Trimmed: a Secret made with `echo value | base64` carries a trailing newline, which the
  // gateway takes as part of the credential and answers with an authentication failure.
  private setting(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }

  private logFailure(details: Record<string, unknown>): void {
    logger.error(details, 'sms_otp_send_failed');
  }
}
