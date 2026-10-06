'use client';

import { CreditCard } from 'lucide-react';
import { useMemo } from 'react';
import { AppPageHeader } from '@/components/design-system';
import { Panel } from '@/components/ui';
import { setUrlParams, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { PaymentMachinesTab } from '@/components/pos/payment-machines-tab';
import { PosDevicesTab } from '@/components/pos/pos-devices-tab';

export function PosMasterPageClient() {
  const [activeTab, setActiveTab] = useUrlParam<'devices' | 'payments'>('tab', 'devices', [
    'devices',
    'payments',
  ]);
  const tabs = useMemo(
    () => [
      { id: 'devices' as const, label: 'POS Devices' },
      { id: 'payments' as const, label: 'Payment Machines' },
    ],
    [],
  );

  return (
    <section className="space-y-5">
      <AppPageHeader
        description="Configure POS devices and payment machines for hospital food operations."
        eyebrow="Masters"
        icon={CreditCard}
        title="POS"
      />
      <Panel className="p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={cn(
                'rounded-control px-4 py-2 text-sm font-semibold text-ds-text-3 transition hover:bg-ds-teal-soft hover:text-ds-teal-text',
                activeTab === tab.id && 'bg-ds-teal-soft text-ds-teal-text',
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
      {activeTab === 'devices' ? <PosDevicesTab /> : <PaymentMachinesTab />}
    </section>
  );
}
