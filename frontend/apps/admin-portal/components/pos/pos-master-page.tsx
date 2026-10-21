'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AppPageHeader, StatStrip } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { Panel } from '@/components/ui';
import { organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { CountersTab } from '@/components/pos/counters-tab';
import { PaymentMachinesTab } from '@/components/pos/payment-machines-tab';
import { PosDevicesTab } from '@/components/pos/pos-devices-tab';
import type { ActiveFilter } from '@/components/pos/shared/types';

type PosTab = 'counters' | 'devices' | 'payments';

export function PosMasterPageClient() {
  const { hasPermission } = useAuth();
  const canViewCounters = hasPermission('COUNTER_VIEW');
  const { scopedHospitalId } = useLocationContext();
  const [urlTab, setActiveTab] = useUrlParam<PosTab>('tab', 'devices', [
    'counters',
    'devices',
    'payments',
  ]);
  // Without COUNTER_VIEW a Counters link falls back to the devices.
  const activeTab = urlTab === 'counters' && !canViewCounters ? 'devices' : urlTab;
  const [activeFilter] = useUrlParam<ActiveFilter>('status', '', ['active', 'inactive']);
  const tabs = useMemo(
    () => [
      { id: 'devices' as const, label: 'POS Devices' },
      { id: 'payments' as const, label: 'Payment Machines' },
      ...(canViewCounters ? [{ id: 'counters' as const, label: 'Counters' }] : []),
    ],
    [canViewCounters],
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
      const [all, inactive] = await Promise.all([count(), count(false)]);

      return { all, inactive };
    },
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
      const [all, inactive] = await Promise.all([count(), count(false)]);

      return { all, inactive };
    },
    queryKey: queryKeys.paymentMachines('stats', scope),
  });
  const devices = deviceStatsQuery.data;
  const machines = machineStatsQuery.data;

  /** A stat's list: its tab, with the status filter it counts and the rest cleared. */
  function show(tab: PosTab, status: ActiveFilter) {
    const patch: Record<string, string | null> = {
      page: null,
      status: status || null,
      tab: tab === 'devices' ? null : tab,
    };

    // Another tab's search does not carry over, as when its tab is picked.
    if (tab !== activeTab) {
      patch.q = null;
    }

    setUrlParams(patch);
  }

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
      <StatStrip
        label="POS at a glance"
        stats={[
          {
            active: activeTab === 'devices' && activeFilter !== 'inactive',
            label: 'POS devices',
            onSelect: () => show('devices', ''),
            value: devices?.all ?? '–',
          },
          {
            active: activeTab === 'payments' && activeFilter !== 'inactive',
            label: 'Payment machines',
            onSelect: () => show('payments', ''),
            value: machines?.all ?? '–',
          },
          {
            active: activeTab === 'devices' && activeFilter === 'inactive',
            label: 'Inactive devices',
            onSelect: () => show('devices', 'inactive'),
            tone: 'pending',
            value: devices?.inactive ?? '–',
          },
          {
            active: activeTab === 'payments' && activeFilter === 'inactive',
            label: 'Inactive machines',
            onSelect: () => show('payments', 'inactive'),
            tone: 'pending',
            value: machines?.inactive ?? '–',
          },
        ]}
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
