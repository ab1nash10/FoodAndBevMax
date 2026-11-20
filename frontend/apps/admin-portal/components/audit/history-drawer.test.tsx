import type { AuditRow } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/lib/api';
import { renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { AuditChanges, HistoryButton } from './history-drawer';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/components/auth-provider', () => import('@/test/auth'));
// The API calls the screen makes, each a typed stand-in.
type AuditApi = typeof ApiModule.auditApi;
const auditApi = vi.hoisted(() => ({
  getRecordHistory: vi.fn<AuditApi['getRecordHistory']>(),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  auditApi,
}));

const change = (patch: Partial<AuditRow>) =>
  ({
    action: 'ITEM_UPDATE',
    actorRole: 'Admin',
    createdAt: '2026-11-18T09:15:00Z',
    id: 'a-1',
    newValue: { itemName: 'Deluxe Veg Thali' },
    oldValue: { itemName: 'Veg Thali' },
    summary: 'Renamed the item',
    user: { id: 'u-1', name: 'Asha Rao' },
    userId: 'u-1',
    ...patch,
  }) as AuditRow;

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['AUDIT_LOG_VIEW']);
});

describe('a record’s history', () => {
  it('is offered only to someone who may read the audit log', () => {
    signedIn(['ITEM_VIEW']);
    renderScreen(<HistoryButton entityId="i-1" entityName="items" recordLabel="Veg Thali" />);

    expect(screen.queryByRole('button', { name: /History/ })).not.toBeInTheDocument();
  });

  it('asks for nothing until opened, then lists the changes newest first', async () => {
    auditApi.getRecordHistory.mockReturnValue(
      reply({
        items: [
          change({}),
          change({
            action: 'ITEM_CREATE',
            id: 'a-0',
            newValue: { itemName: 'Veg Thali' },
            oldValue: null,
          }),
        ],
        nextCursor: null,
      }),
    );
    const { user } = renderScreen(
      <HistoryButton entityId="i-1" entityName="items" recordLabel="Veg Thali" />,
    );
    expect(auditApi.getRecordHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'History of Veg Thali' }));

    const timeline = within(await screen.findByRole('list', { name: 'Changes, newest first' }));
    const [latest, first] = timeline.getAllByRole('listitem');
    expect(latest).toHaveTextContent('Item updated');
    expect(latest).toHaveTextContent('Asha Rao · Admin');
    expect(latest).toHaveTextContent('Renamed the item');
    expect(first).toHaveTextContent('Item created');
    expect(auditApi.getRecordHistory).toHaveBeenCalledWith('items', 'i-1', { cursor: undefined });
  });

  it('says when nothing has been recorded yet', async () => {
    auditApi.getRecordHistory.mockReturnValue(reply({ items: [], nextCursor: null }));
    const { user } = renderScreen(
      <HistoryButton entityId="i-1" entityName="items" recordLabel="Veg Thali" />,
    );

    await user.click(screen.getByRole('button', { name: 'History of Veg Thali' }));

    expect(
      await screen.findByText('Nothing has been recorded for this record yet.'),
    ).toBeInTheDocument();
  });

  it('says why the history could not be loaded', async () => {
    auditApi.getRecordHistory.mockRejectedValue(new ApiClientError(500, 'Audit service is down'));
    const { user } = renderScreen(
      <HistoryButton entityId="i-1" entityName="items" recordLabel="Veg Thali" />,
    );

    await user.click(screen.getByRole('button', { name: 'History of Veg Thali' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Audit service is down');
  });
});

describe('the fields a change made', () => {
  it('shows old and new side by side, and lists of records as tables', () => {
    render(
      <AuditChanges
        row={{
          newValue: { isActive: false, lines: [{ itemName: 'Rice', qty: 5 }] },
          oldValue: { isActive: true },
        }}
      />,
    );

    const status = within(screen.getByText('Is active').parentElement!);
    expect(status.getByText('Yes')).toHaveClass('line-through');
    expect(status.getByText('No')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Item name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Rice' })).toBeInTheDocument();
  });

  it('says so when nothing changed', () => {
    render(<AuditChanges row={{ newValue: null, oldValue: null }} />);

    expect(screen.getByText('No field changes recorded.')).toBeInTheDocument();
  });
});
