import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const REQUEST_TIMEOUT_MS = 10_000;
// A token is reused until this close to its expiry, so a burst of sign-ins asks for one token.
const TOKEN_MARGIN_MS = 60_000;

function otpEmail(otp: string, minutes: number) {
  return {
    subject: `${otp} is your AAHAR sign-in code`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;color:#101828;max-width:480px">
<p style="font-size:15px">Use this code to sign in to AAHAR:</p>
<p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:16px 0">${otp}</p>
<p style="font-size:14px;color:#475467">It is valid for ${minutes} minutes. Do not share it with anyone.</p>
<p style="font-size:13px;color:#667085">If you did not try to sign in, you can ignore this email.</p>
<p style="font-size:13px;color:#667085">Max Healthcare · AAHAR</p>
</div>`,
  };
}

/**
 * Sends OTP emails through Microsoft Graph, as the MAIL_SENDER mailbox, with an Entra app
 * registration's client credentials (application permission Mail.Send). Secrets and tokens are
 * never logged; a failure logs only Graph's status and error code.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private token: { expiresAt: number; value: string } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['MAIL_TENANT_ID', 'MAIL_CLIENT_ID', 'MAIL_CLIENT_SECRET', 'MAIL_SENDER'].every((key) =>
      Boolean(this.setting(key)),
    );
  }

  async sendOtp(email: string, otp: string, minutes: number): Promise<void> {
    const { html, subject } = otpEmail(otp, minutes);
    const response = await this.request(
      `${GRAPH_URL}/users/${encodeURIComponent(this.setting('MAIL_SENDER'))}/sendMail`,
      {
        body: JSON.stringify({
          message: {
            body: { content: html, contentType: 'HTML' },
            subject,
            toRecipients: [{ emailAddress: { address: email } }],
          },
          // A sign-in code has no business sitting in the shared mailbox's Sent Items.
          saveToSentItems: false,
        }),
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );

    // Graph answers a sent message with 202 Accepted and no body.
    if (response.status !== 202) {
      if (response.status === 401) this.token = null;
      await this.fail('mail_otp_send_failed', response);
    }
  }

  /** An app-only Graph token (client credentials), cached until shortly before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return this.token.value;
    }

    const response = await this.request(
      `https://login.microsoftonline.com/${encodeURIComponent(this.setting('MAIL_TENANT_ID'))}/oauth2/v2.0/token`,
      {
        body: new URLSearchParams({
          client_id: this.setting('MAIL_CLIENT_ID'),
          client_secret: this.setting('MAIL_CLIENT_SECRET'),
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
        method: 'POST',
      },
    );

    if (!response.ok) {
      await this.fail('mail_token_failed', response);
    }

    const { access_token: value, expires_in: expiresIn } = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = { expiresAt: Date.now() + expiresIn * 1000, value };

    return value;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'mail_request_failed',
          reason: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
      throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
    }
  }

  private async fail(event: string, response: Response): Promise<never> {
    const body = (await response.json().catch(() => null)) as {
      error?: string | { code?: string };
    } | null;
    const code = typeof body?.error === 'string' ? body.error : body?.error?.code;

    this.logger.error(JSON.stringify({ code, event, status: response.status }));
    throw new ServiceUnavailableException('Could not send the OTP. Please try again.');
  }

  // Trimmed: a Secret made with `echo value | base64` carries a trailing newline.
  private setting(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }
}
