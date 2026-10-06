'use client';

import { statusPresentation } from '@/lib/status';

export function longStatus(status: string): string {
  const presentation = statusPresentation(status);

  return presentation.long ?? presentation.label;
}
