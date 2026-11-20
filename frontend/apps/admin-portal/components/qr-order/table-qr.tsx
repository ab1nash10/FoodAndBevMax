'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getApiErrorMessage, publicOrganizationApi } from '@/lib/api';
import { Notice, QrScreen } from './qr-order';

/**
 * A dine-in table's QR: it opens its restaurant's menu with the table filled in (the ordering
 * page's `table` and `tableId`), or says why it cannot (At Table Dining is off, the table is off).
 */
export function TableQr({ tableId }: Readonly<{ tableId: string }>) {
  const router = useRouter();
  const tableQuery = useQuery({
    queryFn: async () => (await publicOrganizationApi.getQrTable(tableId)).data,
    queryKey: ['qr-table', tableId],
    retry: false,
  });
  const table = tableQuery.data;

  useEffect(() => {
    if (!table) return;
    const query = new URLSearchParams({
      table: table.tableName,
      tableId,
      token: table.token,
    });

    // Replaced, not pushed: back from the menu leaves the QR page rather than reopening it.
    router.replace(`/order/${table.restaurantId}?${query}`);
  }, [router, table, tableId]);

  return (
    <QrScreen>
      {tableQuery.isError ? (
        <Notice tone="bad" title="This QR code is not working">
          {getApiErrorMessage(tableQuery.error)}
        </Notice>
      ) : (
        <div className="grid flex-1 place-items-center">
          <Loader2 aria-label="Opening the menu" className="h-8 w-8 animate-spin text-ds-link" />
        </div>
      )}
    </QrScreen>
  );
}
