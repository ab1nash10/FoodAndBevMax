import { createApiClient, type ApiClientOptions, type ApiResponse } from './http';

/**
 * One audited change. For an update, oldValue/newValue hold only the changed fields; a create
 * has only newValue (the whole record), a delete only oldValue; an event (GRN_POST,
 * TRANSFER_ACKNOWLEDGE) may carry its payload in newValue.
 */
export interface AuditRow {
  action: string;
  actorRole: string | null;
  createdAt: string;
  entityId: string;
  entityName: string;
  hospitalId: string | null;
  id: string;
  ipAddress: string | null;
  locationId: string | null;
  newValue: unknown;
  oldValue: unknown;
  requestId: string | null;
  source: string | null;
  summary: string | null;
  user: { id: string; name: string } | null;
  userId: string | null;
}

/** Newest first; pass nextCursor back as `cursor` for the next page (null: no more). */
export interface AuditPage {
  items: AuditRow[];
  nextCursor: string | null;
}

export interface AuditLogQuery {
  action?: string;
  cursor?: string;
  entityId?: string;
  entityName?: string;
  /** ISO date-time, included. */
  from?: string;
  hospitalId?: string;
  /** 50 when left out, at most 200. */
  limit?: number;
  /** Searches the summary text. */
  q?: string;
  /** ISO date-time, not included. */
  to?: string;
  userId?: string;
}

export function createAuditApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    /** The filtered log as CSV text (the request needs the bearer token, so no plain link). */
    async exportAuditLogs(query: AuditLogQuery = {}) {
      const csv = await client.request<string | undefined>('/audit-logs/export', {
        headers: { Accept: 'text/csv' },
        query,
        timeoutMs: 120_000,
      });
      return csv ?? '';
    },
    getRecordHistory(entityName: string, entityId: string, query: AuditLogQuery = {}) {
      return client.request<ApiResponse<AuditPage>>(
        `/audit-logs/${encodeURIComponent(entityName)}/${encodeURIComponent(entityId)}`,
        { query },
      );
    },
    listAuditLogs(query: AuditLogQuery = {}) {
      return client.request<ApiResponse<AuditPage>>('/audit-logs', { query });
    },
  };
}
