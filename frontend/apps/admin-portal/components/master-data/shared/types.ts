'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ItemType } from '@aahar/api-client';

export type ActiveFilter = '' | 'active' | 'inactive';

export type ItemTypeFilter = '' | ItemType;

export interface PageHeaderProps {
  action?: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}

export interface PaginationControlsProps {
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}
