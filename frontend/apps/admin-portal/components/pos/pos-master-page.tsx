'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Panel } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { CountersTab } from '@/components/pos/counters-tab';
import { PaymentMachinesTab } from '@/components/pos/payment-machines-tab';
import { PosDevicesTab } from '@/components/pos/pos-devices-tab';

type PosTab = 'counters' | 'devices' | 'payments';

const allTabs: Array<{ id: PosTab; label: string; permission: string }> = [
  { id: 'devices', label: 'POS Devices', permission: 'POS_DEVICE_VIEW' },
  { id: 'payments', label: 'Payment machines', permission: 'PAYMENT_MACHINE_VIEW' },
  { id: 'counters', label: 'Counters', permission: 'COUNTER_VIEW' },
];

/** The tab to show: the asked one if its permission is held, else the first one that is. */
export function posTabFor(asked: PosTab, hasPermission: (code: string) => boolean): PosTab {
  const allowed = allTabs.filter((tab) => hasPermission(tab.permission));

  return allowed.find((tab) => tab.id === asked)?.id ?? allowed[0]?.id ?? 'devices';
}

export function PosMasterPageClient() {
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  const [urlTab, setActiveTab] = useUrlParam<PosTab>('tab', 'devices', [
    'counters',
    'devices',
    'payments',
  ]);
  // A typed ?tab= the user lacks the permission for falls back to one they hold.
  const activeTab = posTabFor(urlTab, hasPermission);
  const canViewDevices = hasPermission('POS_DEVICE_VIEW');
  const canViewMachines = hasPermission('PAYMENT_MACHINE_VIEW');
  const tabs = useMemo(
    () => allTabs.filter((tab) => hasPermission(tab.permission)),
    [hasPermission],
  );
  const scope = scopedHospitalId ?? 'all';

  // Each under its own list's key, so whatever refreshes that list refreshes its counts too.
  const deviceStatsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listPosDevices({
            hospitalId: scopedHospitalId,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      return { all: await count() };
    },
    enabled: canViewDevices,
    queryKey: queryKeys.posDevices('stats', scope),
  });
  const machineStatsQuery = useQuery({
    queryFn: async () => {
      const count = async (isActive?: boolean) =>
        (
          await organizationApi.listPaymentMachines({
            hospitalId: scopedHospitalId,
            isActive,
            limit: 0,
          })
        ).data.meta.total;
      return { all: await count() };
    },
    enabled: canViewMachines,
    queryKey: queryKeys.paymentMachines('stats', scope),
  });
  const devices = deviceStatsQuery.data;
  const machines = machineStatsQuery.data;

  return (
    <section className="space-y-5">
      <AppPageHeader
        count={
          activeTab === 'devices'
            ? devices?.all
            : activeTab === 'payments'
              ? machines?.all
              : undefined
        }
        description="Configure POS devices, payment machines and billing counters for hospital food operations."
        title="POS"
      />
      <Panel className="p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={cn(
                'rounded-control px-4 py-2 text-sm font-semibold text-ds-text-3 transition hover:bg-ds-selected hover:text-ds-link',
                activeTab === tab.id && 'bg-ds-primary-soft text-ds-link',
              )}
              key={tab.id}
              onClick={() => {
                if (tab.id !== activeTab) {
                  setUrlParams({ page: null, q: null, status: null });
                  setActiveTab(tab.id);
                }
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Panel>
      {activeTab === 'devices' ? <PosDevicesTab /> : null}
      {activeTab === 'payments' ? <PaymentMachinesTab /> : null}
      {activeTab === 'counters' ? <CountersTab /> : null}
    </section>
  );
}
