'use client';

import type { ReactNode } from 'react';
import type { HospitalSummary, Kitchen } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Select } from '@/components/ui';

export function PageHeader({
  action,
  subtitle,
  title,
}: Readonly<{ action?: ReactNode; subtitle: string; title: string }>) {
  return <AppPageHeader action={action} description={subtitle} title={title} />;
}

/** The shared list footer (design-system ListPager). */
export { ListPager as PaginationControls } from '@/components/design-system';

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

export function KitchenSelect({
  disabled,
  kitchens,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  kitchens: Kitchen[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="">Select kitchen</option>
      {kitchens.map((kitchen) => (
        <option key={kitchen.id} value={kitchen.id}>
          {kitchen.kitchenName}
        </option>
      ))}
    </Select>
  );
}
