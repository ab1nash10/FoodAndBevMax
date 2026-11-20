import { ApiClientError, type QrTable } from '@aahar/api-client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen, reply } from '@/test/harness';
import { router } from '@/test/next-navigation';
import { TableQr } from './table-qr';
import type * as ApiModule from '@/lib/api';

type Client = typeof ApiModule.publicOrganizationApi;

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = vi.hoisted(() => ({
  getQrTable: vi.fn<Client['getQrTable']>(),
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  publicOrganizationApi: api,
}));

const table: QrTable = {
  restaurantId: 'r1',
  restaurantName: 'Cafe Max',
  tableName: 'Window 2',
  token: 'secret-1',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a table's QR page", () => {
  it("opens its restaurant's menu with the table filled in", async () => {
    api.getQrTable.mockImplementation(() => reply(table));
    renderScreen(<TableQr tableId="t1" />);

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/order/r1?table=Window+2&tableId=t1&token=secret-1',
      ),
    );
    expect(api.getQrTable).toHaveBeenCalledWith('t1');
  });

  it("says why when the restaurant doesn't take orders at the table", async () => {
    api.getQrTable.mockRejectedValue(
      new ApiClientError(
        400,
        'Cafe Max does not take orders at the table. Please order at the counter.',
      ),
    );
    renderScreen(<TableQr tableId="t1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This QR code is not working' +
        'Cafe Max does not take orders at the table. Please order at the counter.',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
