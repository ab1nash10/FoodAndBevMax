import { ApiClientError } from '@aahar/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CsvModule from '@/lib/csv';
import { renderScreen, reply } from '@/test/harness';
import { downloadCsv } from '@/lib/csv';
import {
  CsvImportExport,
  fetchAllPages,
  type CsvColumn,
  type CsvRowImporter,
} from './csv-import-export';

vi.mock('next/navigation', () => import('@/test/next-navigation'));
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof CsvModule>()),
  downloadCsv: vi.fn(),
}));

interface Store {
  code: string;
  name: string;
  phone: string | null;
  location: string;
}

const columns: Array<CsvColumn<Store>> = [
  { header: 'Store code', required: true, value: (store) => store.code },
  {
    header: 'Store name',
    hint: 'Up to 255 characters.',
    required: true,
    value: (store) => store.name,
  },
  { header: 'Phone', optional: true, value: (store) => store.phone },
  { header: 'Location', readOnly: true, value: (store) => store.location },
];

const onImported = vi.fn();

function renderButtons(
  startImport?: () => Promise<CsvRowImporter>,
  exportRows = () => Promise.resolve<Store[]>([]),
) {
  return renderScreen(
    <CsvImportExport
      columns={columns}
      exportRows={exportRows}
      filename="stores"
      noun="stores"
      onImported={onImported}
      startImport={startImport}
    />,
  );
}

async function importFile(csv: string, importer: CsvRowImporter) {
  const { user } = renderButtons(() => Promise.resolve(importer));
  await user.click(screen.getByRole('button', { name: 'Import' }));
  await user.upload(
    document.querySelector<HTMLInputElement>('input[type="file"]')!,
    new File([csv], 'stores.csv'),
  );
}

beforeEach(() => vi.clearAllMocks());

describe('exporting a list', () => {
  it('writes every column’s header and each row, blanks left empty', async () => {
    const { user } = renderButtons(undefined, () =>
      Promise.resolve([{ code: 'STR01', location: 'Patparganj', name: 'Main Store', phone: null }]),
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalled());
    const [filename, rows] = vi.mocked(downloadCsv).mock.calls[0]!;
    expect(filename).toMatch(/^stores-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(rows).toEqual([
      ['Store code', 'Store name', 'Phone', 'Location'],
      ['STR01', 'Main Store', '', 'Patparganj'],
    ]);
  });

  it('says why the export failed', async () => {
    const { user } = renderButtons(undefined, () =>
      Promise.reject(new ApiClientError(500, 'List unavailable')),
    );

    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not export stores');
    expect(screen.getByRole('alert')).toHaveTextContent('List unavailable');
  });
});

describe('importing a file', () => {
  it('is hidden when the user may not add records', () => {
    renderButtons();

    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
  });

  it('lists the columns it reads, not the ones only an export has', async () => {
    const { user } = renderButtons(() => Promise.resolve(vi.fn()));

    await user.click(screen.getByRole('button', { name: 'Import' }));

    const panel = within(screen.getByRole('dialog', { name: 'Import stores' }));
    expect(panel.getByText('Store name')).toBeInTheDocument();
    expect(panel.getByText('Up to 255 characters.')).toBeInTheDocument();
    expect(panel.queryByText('Location')).not.toBeInTheDocument();
  });

  it('saves the rows one at a time, by header in any order, and lists the ones that failed', async () => {
    const importer = vi.fn<CsvRowImporter>((cells) =>
      cells('Store name') === 'Bad'
        ? Promise.reject(new Error('Store name is taken'))
        : Promise.resolve(cells('Store code') === 'STR01' ? 'updated' : 'created'),
    );

    // Phone may be left out of the file; Location is ignored.
    await importFile(
      'store name,Store code,Location\nMain Store,STR01,x\nNew Store,STR02,y\nBad,STR03,z\n',
      importer,
    );

    const result = await screen.findByRole('dialog', { name: 'Imported stores' });
    expect(result).toHaveTextContent('1 added, 1 updated, 1 not imported of 3 rows.');
    expect(result).toHaveTextContent('Row 4: Store name is taken');
    const firstRow = importer.mock.calls[0]![0];
    expect([firstRow('Store code'), firstRow('Phone')]).toEqual(['STR01', '']);
    expect(onImported).toHaveBeenCalled();
  });

  it('refuses a file missing a column it needs', async () => {
    const importer = vi.fn<CsvRowImporter>();
    await importFile('Store name\nMain Store\n', importer);

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing column: Store code.');
    expect(importer).not.toHaveBeenCalled();
  });

  it('refuses a file with nothing under its header', async () => {
    await importFile('Store code,Store name\n', vi.fn<CsvRowImporter>());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The file has no rows under its header.',
    );
  });

  it('reports a lookup that failed before any row was read', async () => {
    const { user } = renderButtons(() => Promise.reject(new Error('Could not load the locations')));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    await user.upload(
      document.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(['Store code,Store name\nSTR01,Main\n'], 'stores.csv'),
    );

    expect(await screen.findByRole('dialog', { name: 'Imported stores' })).toHaveTextContent(
      'Import: Could not load the locations',
    );
  });
});

// Cell readers (yesNo, numberCell, nameKey…) have their logic tests in csv-import-export.test.ts
// and restaurant-menus-csv.test.ts.
describe('loading a whole list', () => {
  it('gathers every page of a list', async () => {
    const load = vi.fn((pageNo: number) =>
      reply({ items: [pageNo], meta: { limit: 1, page: pageNo, total: 3, totalPages: 3 } }),
    );

    expect(await fetchAllPages(load)).toEqual([1, 2, 3]);
  });
});
