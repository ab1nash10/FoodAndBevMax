'use client';

import type { AuditPage, AuditRow } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Badge, Skeleton } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { auditApi, getApiErrorMessage } from '@/lib/api';
import { actionLabel, actionTone, auditChanges, type AuditCell } from '@/lib/audit';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const whenFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function formatAuditTime(value: string): string {
  return whenFormatter.format(new Date(value));
}

/** Who did it: the user's name, or "System" for a change no one signed in made. */
export function auditActor(row: Pick<AuditRow, 'user' | 'userId'>): string {
  return row.user?.name ?? (row.userId ? 'Unknown user' : 'System');
}

export function ActionChip({ action }: Readonly<{ action: string }>) {
  return (
    <Badge className="normal-case" title={action} variant={actionTone(action)}>
      {actionLabel(action)}
    </Badge>
  );
}

function CellView({ cell, old = false }: Readonly<{ cell: AuditCell; old?: boolean }>) {
  if ('text' in cell) {
    return (
      <span className={cn('wrap-break-word', old ? 'text-ds-muted line-through' : 'font-medium')}>
        {cell.text}
      </span>
    );
  }

  // A list of records (lines, batches): a small table that scrolls sideways inside its box.
  return (
    <div
      className={cn(
        'max-w-full basis-full overflow-x-auto rounded-control border border-ds-divider',
        old && 'opacity-70',
      )}
    >
      <table className="w-full whitespace-nowrap text-[12px]">
        <thead className="bg-ds-subtle text-left text-ds-muted">
          <tr>
            {cell.columns.map((column) => (
              <th className="px-2.5 py-1.5 font-medium" key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cell.rows.map((row, index) => (
            <tr className="border-t border-ds-divider" key={index}>
              {row.map((value, column) => (
                <td className="px-2.5 py-1.5 text-ds-text-2" key={column}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The fields an audit row changed: old → new (only new for a create, only old for a delete). */
export function AuditChanges({ row }: Readonly<{ row: Pick<AuditRow, 'newValue' | 'oldValue'> }>) {
  const changes = auditChanges(row);

  if (changes.length === 0) {
    return <p className="text-[12.5px] text-ds-muted">No field changes recorded.</p>;
  }

  return (
    <dl className="grid gap-2.5 text-[12.5px]">
      {changes.map((change) => (
        <div className="min-w-0" key={change.field}>
          <dt className="font-semibold text-ds-muted">{change.label}</dt>
          <dd className="mt-0.5 flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1 text-ds-text">
            {change.before ? <CellView cell={change.before} old={Boolean(change.after)} /> : null}
            {change.before && change.after ? (
              <>
                <span aria-hidden="true" className="text-ds-muted">
                  →
                </span>
                <span className="sr-only">changed to</span>
              </>
            ) : null}
            {change.after ? <CellView cell={change.after} /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function HistoryTimeline({
  entityId,
  entityName,
}: Readonly<{ entityId: string; entityName: string }>) {
  const query = useInfiniteQuery({
    getNextPageParam: (last: AuditPage) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (await auditApi.getRecordHistory(entityName, entityId, { cursor: pageParam })).data,
    queryKey: queryKeys.auditLogs('history', entityName, entityId),
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) {
    return (
      <div aria-label="Loading history" className="space-y-3" role="status">
        {[0, 1, 2].map((index) => (
          <Skeleton className="h-20 w-full" key={index} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="text-sm text-ds-status-bad-fg" role="alert">
        {getApiErrorMessage(query.error)}
      </p>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-ds-muted">Nothing has been recorded for this record yet.</p>;
  }

  return (
    <div className="space-y-4">
      <ol
        aria-label="Changes, newest first"
        className="relative space-y-4 border-l border-ds-divider pl-5"
      >
        {rows.map((row) => (
          <li className="relative min-w-0" key={row.id}>
            <span
              aria-hidden="true"
              className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-ds-primary ring-4 ring-ds-surface"
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ActionChip action={row.action} />
              <time className="text-[12px] text-ds-muted" dateTime={row.createdAt}>
                {formatAuditTime(row.createdAt)}
              </time>
            </div>
            <p className="mt-1 text-[13px] text-ds-text-2">
              <span className="font-semibold text-ds-text">{auditActor(row)}</span>
              {row.actorRole ? ` · ${row.actorRole}` : null}
            </p>
            {row.summary ? <p className="mt-1 text-[13px] text-ds-text">{row.summary}</p> : null}
            <div className="mt-2 rounded-control bg-ds-subtle-2 p-3">
              <AuditChanges row={row} />
            </div>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <Button
          className="w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {query.isFetchingNextPage ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : null}
          Load more
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A record's History button, for users with AUDIT_LOG_VIEW: opens a side panel with what was
 * done to the record, newest first. Nothing is fetched until it is opened.
 */
export function HistoryButton({
  entityId,
  entityName,
  recordLabel,
}: Readonly<{ entityId: string; entityName: string; recordLabel: string }>) {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);

  if (!hasPermission('AUDIT_LOG_VIEW')) {
    return null;
  }

  return (
    <>
      <Button
        aria-haspopup="dialog"
        aria-label={`History of ${recordLabel}`}
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <History aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
        History
      </Button>
      <Modal
        description="Every change to this record, newest first."
        onClose={() => setOpen(false)}
        open={open}
        side
        title={`History · ${recordLabel}`}
      >
        <HistoryTimeline entityId={entityId} entityName={entityName} />
      </Modal>
    </>
  );
}
