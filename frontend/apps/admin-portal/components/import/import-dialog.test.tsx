import type { ImportRequest, ImportResult } from '@aahar/api-client';
import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { signedIn } from '@/test/auth';
import { downloadImportTemplate } from '@/lib/import-template';
import type { ImportDefinition } from './import-definitions';
import { ImportButton } from './import-dialog';

vi.mock('@/components/auth-provider', () => import('@/test/auth'));
vi.mock('@/lib/import-template', () => ({
  downloadImportTemplate: vi.fn(() => Promise.resolve()),
}));

const send =
  vi.fn<
    (body: ImportRequest) => Promise<{ data: ImportResult; message: string; success: boolean }>
  >();
const refresh = vi.fn();
const definition: ImportDefinition = {
  columns: [
    { example: 'ITM0001', field: 'itemCode', header: 'Item code', hint: 'Blank adds a new item.' },
    {
      example: 'Masala Dosa',
      field: 'itemName',
      header: 'Item name',
      hint: 'Up to 255 characters.',
      required: true,
    },
  ],
  filename: 'items-import-template',
  matching: 'A row with an Item code updates that item.',
  noun: 'items',
  permissions: ['ITEM_CREATE', 'ITEM_UPDATE'],
  refresh,
  send,
};

const result = (rows: ImportResult['rows'], imported = false): ImportResult => ({
  created: rows.filter((row) => row.action === 'create' && !row.errors.length).length,
  imported,
  rows,
  skipped: rows.filter((row) => row.action === 'skip').length,
  updated: rows.filter((row) => row.action === 'update' && !row.errors.length).length,
});

async function chooseFile(csv: string, name = 'items.csv') {
  const { user } = renderScreen(<ImportButton definition={definition} />);
  await user.click(screen.getByRole('button', { name: 'Import' }));
  const panel = screen.getByRole('dialog', { name: 'Import items' });
  await user.upload(
    panel.querySelector<HTMLInputElement>('input[type="file"]')!,
    new File([csv], name, { type: 'text/csv' }),
  );
  return { panel: within(panel), user };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn(['ITEM_CREATE']);
});

describe('importing from a file', () => {
  it('is offered to someone who may add or change the records', () => {
    signedIn(['ITEM_VIEW']);
    renderScreen(<ImportButton definition={definition} />);

    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  });

  it('lists the columns a file needs, and offers the template', async () => {
    const { user } = renderScreen(<ImportButton definition={definition} />);

    await user.click(screen.getByRole('button', { name: 'Import' }));
    const panel = within(screen.getByRole('dialog', { name: 'Import items' }));
    expect(panel.getByText('A row with an Item code updates that item.')).toBeInTheDocument();
    expect(panel.getByText('Item name')).toBeInTheDocument();
    expect(panel.getByText('Up to 255 characters.')).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Download Excel template' }));
    expect(downloadImportTemplate).toHaveBeenCalledWith(definition);
  });

  it('checks every row first without saving, then imports them all', async () => {
    send
      .mockReturnValueOnce(
        reply(
          result([
            { action: 'create', errors: [] },
            { action: 'update', errors: [] },
          ]),
        ),
      )
      .mockReturnValueOnce(
        reply(
          result(
            [
              { action: 'create', errors: [] },
              { action: 'update', errors: [] },
            ],
            true,
          ),
        ),
      );
    const { panel, user } = await chooseFile(
      'Item code,Item name,Notes\n,Masala Dosa,x\nITM0001,Veg Thali,y\n',
    );

    expect(
      await panel.findByText(/2 rows\. 1 new, 1 to update, 0 unchanged\./),
    ).toBeInTheDocument();
    // Read by header: the extra column is left out.
    expect(send).toHaveBeenCalledWith({
      dryRun: true,
      rows: [
        { itemCode: '', itemName: 'Masala Dosa' },
        { itemCode: 'ITM0001', itemName: 'Veg Thali' },
      ],
    });
    expect(panel.getByText('New')).toBeInTheDocument();
    expect(panel.getByText('Update')).toBeInTheDocument();

    await user.click(panel.getByRole('button', { name: 'Import 2 rows' }));

    expect(await panel.findByRole('status')).toHaveTextContent('1 added, 1 updated.');
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false }));
    expect(refresh).toHaveBeenCalled();
  });

  it('lists the rows to fix first, and imports nothing until every row is right', async () => {
    send.mockReturnValueOnce(
      reply(
        result([
          { action: 'create', errors: [] },
          { action: 'create', errors: ['Item name is taken'] },
        ]),
      ),
    );
    const { panel } = await chooseFile('Item name\nMasala Dosa\nVeg Thali\n');

    expect(await panel.findByText(/1 row to fix/)).toBeInTheDocument();
    const [, first] = panel.getAllByRole('row');
    // Numbered as in the spreadsheet, the header being row 1.
    expect(first).toHaveTextContent('3Item name is takenVeg Thali');
    expect(panel.getByRole('button', { name: /^Import/ })).toBeDisabled();
  });

  it('refuses a file without a required column', async () => {
    const { panel } = await chooseFile('Item code\nITM0001\n');

    expect(await panel.findByRole('alert')).toHaveTextContent('Missing column: Item name.');
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a file that is not Excel or CSV', async () => {
    const { panel } = await chooseFile('hello', 'items.txt');

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Choose an Excel (.xlsx) or CSV file.',
    );
  });

  it('shows the server’s reason when the check fails', async () => {
    send.mockRejectedValueOnce(new ApiClientError(413, 'Too many rows'));
    const { panel } = await chooseFile('Item name\nMasala Dosa\n');

    expect(await panel.findByRole('alert')).toHaveTextContent('Too many rows');
  });

  it('shows the rows again when something changed between the check and the import', async () => {
    send
      .mockReturnValueOnce(reply(result([{ action: 'create', errors: [] }])))
      .mockReturnValueOnce(
        reply(result([{ action: 'create', errors: ['Masala Dosa was added by someone else'] }])),
      );
    const { panel, user } = await chooseFile('Item name\nMasala Dosa\n');

    await user.click(await panel.findByRole('button', { name: 'Import 1 row' }));

    expect(await panel.findByText('Masala Dosa was added by someone else')).toBeInTheDocument();
    await waitFor(() => expect(refresh).not.toHaveBeenCalled());
  });
});
