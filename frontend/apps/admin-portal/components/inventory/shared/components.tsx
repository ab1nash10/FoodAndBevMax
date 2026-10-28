'use client';

import type { ReactNode } from 'react';
import type { HospitalSummary, Store } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Select } from '@/components/ui';

export function PageHeader({
  action,
  count,
  subtitle,
  title,
}: Readonly<{ action?: ReactNode; count?: number; subtitle: string; title: string }>) {
  return <AppPageHeader action={action} count={count} description={subtitle} title={title} />;
}

export { FilterSearch as SearchInput } from '@/components/ui-controls';

/** The shared list footer (design-system ListPager). */
export { ListPager as PaginationControls } from '@/components/design-system';

export { QueryState } from '@/components/location-empty-states';
export function HospitalSelect({
  disabled = false,
  hospitals,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  hospitals: HospitalSummary[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select location</option>
      {hospitals.map((hospital) => (
        <option key={hospital.id} value={hospital.id}>
          {hospital.hospitalName}
        </option>
      ))}
    </Select>
  );
}

export function StoreSelect({
  disabled,
  onChange,
  stores,
  value,
}: Readonly<{
  disabled?: boolean;
  onChange: (value: string) => void;
  stores: Store[];
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select store</option>
      {stores.map((store) => (
        <option key={store.id} value={store.id}>
          {store.storeName}
        </option>
      ))}
    </Select>
  );
}
