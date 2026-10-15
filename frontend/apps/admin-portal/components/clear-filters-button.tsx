'use client';

import { Button } from '@aahar/ui';
import { X } from 'lucide-react';

/** Shown only while a list has a filter set; puts every filter back to its default. */
export function ClearFiltersButton({
  active,
  onClear,
}: Readonly<{ active: boolean; onClear: () => void }>) {
  if (!active) {
    return null;
  }

  return (
    <Button onClick={onClear} type="button" variant="outline">
      <X aria-hidden="true" className="h-4 w-4" />
      Clear filters
    </Button>
  );
}
