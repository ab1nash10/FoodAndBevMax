import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { downloadImportTemplate } from './import-template';

// The writer is swapped for one that keeps what it was given, so the sheets can be checked.
const written = vi.hoisted(() => ({ sheets: [] as Array<{ data: unknown[][]; sheet: string }> }));
vi.mock('write-excel-file/universal', () => ({
  default: (sheets: Array<{ data: unknown[][]; sheet: string }>) => {
    written.sheets = sheets;
    return { toBlob: () => Promise.resolve(new Blob(['x'])) };
  },
}));

let link: { click: ReturnType<typeof vi.fn>; download: string; href: string };

beforeEach(() => {
  link = { click: vi.fn(), download: '', href: '' };
  vi.stubGlobal('document', { createElement: () => link });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:template');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const definition = {
  columns: [
    { example: '', field: 'itemCode', header: 'Item code', hint: 'Blank adds an item.' },
    {
      example: 'Masala Dosa',
      field: 'itemName',
      header: 'Item name',
      hint: 'No two items may have the same name.',
      required: true,
    },
  ],
  filename: 'items-import-template',
  matching: 'A row with an Item code updates that item.',
  noun: 'menu items',
};

const text = (cell: unknown) => (cell as { value?: string } | null)?.value;

test('the first sheet is the one the import reads: just the headers, required ones marked', async () => {
  await downloadImportTemplate(definition);

  const [data] = written.sheets;
  assert.equal(data?.sheet, 'Menu items');
  // Headers only, so sample values can't be imported by mistake.
  assert.equal(data?.data.length, 1);
  assert.deepEqual(data?.data[0]?.map(text), ['Item code', 'Item name']);
  assert.notEqual(
    (data?.data[0]?.[1] as { backgroundColor?: string }).backgroundColor,
    (data?.data[0]?.[0] as { backgroundColor?: string }).backgroundColor,
  );
  assert.equal(link.download, 'items-import-template.xlsx');
  assert.equal(link.click.mock.calls.length, 1);
});

test('an Instructions sheet lists every column with whether it is required and its rules', async () => {
  await downloadImportTemplate(definition);

  const instructions = written.sheets[1];
  assert.equal(instructions?.sheet, 'Instructions');
  const rows = instructions?.data.map((row) => row.map(text)) ?? [];
  const flat = rows.flat().join('\n');
  assert.match(flat, /A row with an Item code updates that item\./);
  assert.match(flat, /nothing is imported/i);
  assert.deepEqual(rows.at(-2), ['Item code', 'Optional', 'Blank adds an item.', undefined]);
  assert.deepEqual(rows.at(-1), [
    'Item name',
    'Required',
    'No two items may have the same name.',
    'Masala Dosa',
  ]);
});
