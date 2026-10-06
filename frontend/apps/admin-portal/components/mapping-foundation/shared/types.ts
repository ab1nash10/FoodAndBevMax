'use client';

import type { LucideIcon } from 'lucide-react';

export type ActiveFilter = '' | 'active' | 'inactive';

export interface MappingFormValues {
  isActive: boolean;
  itemId: string;
  parentId: string;
}

export interface PageHeaderProps {
  icon: LucideIcon;
  subtitle: string;
  title: string;
}

export interface PaginationControlsProps {
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}
