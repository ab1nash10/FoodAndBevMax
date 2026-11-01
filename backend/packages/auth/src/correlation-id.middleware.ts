// The request id now lives in @aahar/logging's RequestContext; these names stay for existing imports.
export {
  getRequestId,
  REQUEST_ID_HEADER,
  requestContextMiddleware as correlationIdMiddleware,
} from '@aahar/logging';
export type { CorrelatedRequest } from '@aahar/logging';
