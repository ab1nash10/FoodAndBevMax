import type { ErpPostingDetail, ErpPostingStatus } from '@aahar/api-client';

const statuses: Record<
  ErpPostingStatus,
  { label: string; tone: 'danger' | 'info' | 'neutral' | 'success' }
> = {
  EMPTY: { label: 'Nothing to send', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'danger' },
  PENDING: { label: 'Sending', tone: 'info' },
  SUCCESS: { label: 'Success', tone: 'success' },
};

export function erpStatus(status: ErpPostingStatus) {
  return statuses[status];
}

/**
 * One send as a text file, laid out like the old system's ERP logs: the request body as sent
 * (its token went in a header and is never kept), then the ERP's answer.
 */
export function erpLogFile(posting: ErpPostingDetail): string {
  const seconds = posting.durationMs === null ? '—' : (posting.durationMs / 1000).toFixed(3);
  const answer =
    posting.responseStatus === null
      ? `No answer: ${posting.error ?? 'the ERP did not answer.'}`
      : `HTTP ${posting.responseStatus}\n${posting.responseBody ?? ''}`;

  return [
    `Restaurant: ${posting.restaurantName ?? posting.restaurantId}`,
    `Business day: ${posting.businessDate}`,
    `Sent: ${new Date(posting.createdAt).toISOString()} by ${posting.sentByName ?? 'unknown'}`,
    `Bills: ${posting.billCount}, lines: ${posting.rowCount}, status: ${erpStatus(posting.status).label}`,
    ...(posting.error ? [`Error: ${posting.error}`] : []),
    `Time ${seconds}sec`,
    '',
    'Request',
    posting.requestBody ?? '(nothing was sent)',
    '',
    'Response',
    answer,
    '',
  ].join('\n');
}

export function erpLogFileName(posting: Pick<ErpPostingDetail, 'businessDate' | 'restaurantName'>) {
  const name = (posting.restaurantName ?? 'restaurant').replace(/[^\w-]+/g, '-');
  return `ERPReport-${name}-${posting.businessDate}.txt`;
}

/** Text saved as a file (the log file is built here, not fetched as a link). */
export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
