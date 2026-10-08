'use client';

import { Button } from '@aahar/ui';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Hospital, Store } from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Input, Select } from '@/components/ui';

export function PageHeader({
  action,
  subtitle,
  title,
}: Readonly<{ action?: ReactNode; subtitle: string; title: string }>) {
  return <AppPageHeader action={action} description={subtitle} eyebrow="Inventory" title={title} />;
}

export function SearchInput({
  onChange,
  value,
}: Readonly<{ onChange: (value: string) => void; value: string }>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        value={value}
      />
    </div>
  );
}

export function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: Readonly<{
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}>) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-ds-muted sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing page {page} of {Math.max(totalPages, 1)} · {total} records · {limit} per page
      </span>
      <div className="flex gap-2">
        <Button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export { QueryState } from '@/components/location-empty-states';
export function HospitalSelect({
  disabled = false,
  hospitals,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  hospitals: Hospital[];
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
