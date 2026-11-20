import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const REQUEST_TIMEOUT_MS = 10_000;
// A token is reused until this close to its expiry.
const TOKEN_MARGIN_MS = 60_000;

/**
 * Sends email through Microsoft Graph as the MAIL_SENDER mailbox, with the Entra app the sign-in
 * codes use (auth-service MailService). Not set up: nothing is sent. Secrets and tokens are never
 * logged; a failure throws with Graph's status only.
 */
// ponytail: a second copy of auth-service's Graph token + sendMail; move both into a shared
// package if a third service needs to send mail.
@Injectable()
export class Mailer {
  private token: { expiresAt: number; value: string } | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return ['MAIL_TENANT_ID', 'MAIL_CLIENT_ID', 'MAIL_CLIENT_SECRET', 'MAIL_SENDER'].every((key) =>
      Boolean(this.setting(key)),
    );
  }

  /** Sends one HTML email to everyone in `to`; false when mail is not set up or `to` is empty. */
  async send(to: string[], subject: string, html: string): Promise<boolean> {
    if (to.length === 0 || !this.isConfigured()) {
      return false;
    }

    const response = await fetch(
      `${GRAPH_URL}/users/${encodeURIComponent(this.setting('MAIL_SENDER'))}/sendMail`,
      {
        body: JSON.stringify({
          message: {
            body: { content: html, contentType: 'HTML' },
            subject,
            toRecipients: to.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: true,
        }),
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    // Graph answers a sent message with 202 Accepted.
    if (response.status !== 202) {
      if (response.status === 401) this.token = null;
      throw new Error(`mail_send_failed: Graph answered ${response.status}`);
    }

    return true;
  }

  /** An app-only Graph token (client credentials), cached until shortly before it expires. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
      return this.token.value;
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.setting('MAIL_TENANT_ID'))}/oauth2/v2.0/token`,
      {
        body: new URLSearchParams({
          client_id: this.setting('MAIL_CLIENT_ID'),
          client_secret: this.setting('MAIL_CLIENT_SECRET'),
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      throw new Error(`mail_token_failed: Microsoft answered ${response.status}`);
    }

    const { access_token: value, expires_in: expiresIn } = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.token = { expiresAt: Date.now() + expiresIn * 1000, value };

    return value;
  }

  private setting(key: string): string {
    return this.config.get<string>(key)?.trim() ?? '';
  }
}
