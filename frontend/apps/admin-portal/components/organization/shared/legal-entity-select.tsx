'use client';

import type { LegalEntity } from '@aahar/api-client';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { useLegalEntityOptions } from '@/components/organization/shared/hooks';
import { Select } from '@/components/ui';

/** A record's entity in a list: its location name, then the company; "Not set" without one. */
export function LegalEntityCell({ entity }: Readonly<{ entity: LegalEntity | undefined }>) {
  if (!entity) {
    return <span className="text-ds-text-3">Not set</span>;
  }

  return (
    <div title={`${entity.entityName} · ${entity.gstNumber}`}>
      <p className="font-medium text-ds-text">{entity.locationName ?? entity.entityName}</p>
      {entity.locationName ? (
        <p className="line-clamp-2 text-xs text-ds-muted">{entity.entityName}</p>
      ) : null}
    </div>
  );
}

/**
 * The active legal entities, by name and GST number, with "No entity" first. A record linked to
 * an entity that has since been made inactive keeps showing it rather than appearing unlinked.
 */
export const LegalEntitySelect = forwardRef<
  HTMLSelectElement,
  ComponentPropsWithoutRef<'select'> & { value: string }
>(function LegalEntitySelect({ value, ...props }, ref) {
  const entitiesQuery = useLegalEntityOptions();
  const entities = entitiesQuery.data ?? [];
  const isListed = !value || entities.some((entity) => entity.id === value);

  return (
    <Select disabled={entitiesQuery.isLoading} ref={ref} value={value} {...props}>
      <option value="">No entity</option>
      {entities.map((entity) => (
        <option key={entity.id} value={entity.id}>
          {entity.locationName ? `${entity.locationName} · ` : ''}
          {entity.entityName}
        </option>
      ))}
      {isListed || entitiesQuery.isLoading ? null : (
        <option value={value}>The current entity (inactive)</option>
      )}
    </Select>
  );
});
