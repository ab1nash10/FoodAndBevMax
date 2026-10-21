'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ItemType } from '@aahar/api-client';

export type ActiveFilter = '' | 'active' | 'inactive';

export type ItemTypeFilter = '' | ItemType;

export interface PageHeaderProps {
  action?: ReactNode;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}
