import { createApiClient, type ApiClientOptions, type ApiResponse } from './http';
import type { ReportResult } from './reports';

/** PENDING while the ERP has not answered; EMPTY when the day had no bills (nothing sent). */
export type ErpPostingStatus = 'EMPTY' | 'FAILED' | 'PENDING' | 'SUCCESS';

/** One send of a restaurant's day to the ERP. */
export interface ErpPosting {
  billCount: number;
  /** The business day, YYYY-MM-DD. */
  businessDate: string;
  createdAt: string;
  durationMs: number | null;
  error: string | null;
  hospitalId: string;
  id: string;
  responseStatus: number | null;
  restaurantId: string;
  restaurantName: string | null;
  rowCount: number;
  sentBy: string | null;
  sentByName: string | null;
  status: ErpPostingStatus;
}

/** The attempt in full: the journal sent (as the ERP Journal report), the request, the answer. */
export interface ErpPostingDetail extends ErpPosting {
  report: ReportResult | null;
  /** The JSON sent, without the token (that went in a header and is never kept). */
  requestBody: string | null;
  responseBody: string | null;
}

export interface ErpPostingPage {
  /** False until IT sets the ERP address and token: sending is then refused. */
  enabled: boolean;
  items: ErpPosting[];
  limit: number;
  page: number;
  total: number;
}

export interface ErpPostingQuery {
  /** Business days, YYYY-MM-DD, both included. */
  from?: string;
  hospitalId?: string;
  limit?: number;
  page?: number;
  restaurantId?: string;
  status?: ErpPostingStatus;
  to?: string;
}

export interface SendErpPostingInput {
  businessDate: string;
  hospitalId: string;
  /** Send a day the ERP already took, again. */
  resend?: boolean;
  restaurantId: string;
}

export function createErpPostingsApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    getErpPosting(id: string) {
      return client.request<ApiResponse<ErpPostingDetail>>(
        `/erp-postings/${encodeURIComponent(id)}`,
      );
    },
    listErpPostings(query: ErpPostingQuery = {}) {
      return client.request<ApiResponse<ErpPostingPage>>('/erp-postings', { query });
    },
    /** Waits for the ERP's answer (up to a minute on the server). */
    sendErpPosting(input: SendErpPostingInput) {
      return client.request<ApiResponse<ErpPosting>>('/erp-postings', {
        body: input,
        method: 'POST',
        timeoutMs: 90_000,
      });
    },
  };
}
