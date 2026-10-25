import { createApiClient, type ApiClientOptions, type ApiResponse } from './http';

/** A report the signed-in user may run. */
export interface ReportCatalogEntry {
  code: string;
  description: string;
  title: string;
}

export interface ReportColumn {
  /** A heading over several columns, e.g. "POS Orders". */
  group?: string;
  key: string;
  kind?: 'money' | 'number' | 'text';
  label: string;
}

export type ReportRow = Record<string, number | string | null>;

/** A report laid out as the old system's Excel export: its header block, columns and rows. */
export interface ReportResult {
  code: string;
  columns: ReportColumn[];
  from: string;
  generatedAt: string;
  /** "MAX - Max Healthcare, New Delhi, Delhi-110017". */
  location: string;
  /** A plain table for another system to import (the ERP journal): no heading block or totals. */
  plain: boolean;
  restaurants: string[];
  rows: ReportRow[];
  title: string;
  to: string;
  /** Sums of the money and number columns; null when there are no rows. */
  totals: ReportRow | null;
}

export interface ReportQuery {
  /** ISO date-time, included. */
  from: string;
  hospitalId: string;
  /** Comma-separated restaurant ids; all when omitted. */
  restaurantIds?: string;
  /** ISO date-time, not included. */
  to: string;
}

export function createReportsApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    listReports() {
      return client.request<ApiResponse<ReportCatalogEntry[]>>('/reports');
    },
    runReport(code: string, query: ReportQuery) {
      return client.request<ApiResponse<ReportResult>>(`/reports/${code}`, { query });
    },
  };
}
