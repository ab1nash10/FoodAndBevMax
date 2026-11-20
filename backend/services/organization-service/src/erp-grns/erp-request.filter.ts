import { GlobalExceptionFilter } from '@aahar/auth';
import { Catch } from '@nestjs/common';

/**
 * A refused POST /erp/grns, in the shape the ERP expects: no transaction number, "Request
 * failed", success false, and each reason in `errors` (a signature, a field, a code). Logging
 * and status codes stay those of every other route.
 */
@Catch()
export class ErpRequestFilter extends GlobalExceptionFilter {
  protected override body(failure: {
    errors: unknown[];
    message: string;
    requestId: string | undefined;
  }): Record<string, unknown> {
    return {
      errors: failure.errors.length > 0 ? failure.errors : [failure.message],
      message: 'Request failed',
      requestId: failure.requestId,
      success: false,
      transaction_number: null,
    };
  }
}
