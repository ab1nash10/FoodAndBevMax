'use client';

import type { LucideIcon } from 'lucide-react';

export type ActiveFilter = '' | 'active' | 'inactive';

export interface MappingFormValues {
  /** The item's category, set while mapping (Store Items, Kitchen Items). */
  categoryId: string;
  isActive: boolean;
  itemId: string;
  parentId: string;
}

export interface PageHeaderProps {
  icon: LucideIcon;
  subtitle: string;
  title: string;
}
