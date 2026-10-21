'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { Hospital as HospitalRecord, OnlinePaymentOption } from '@aahar/api-client';
import type {
  hospitalSchema,
  kitchenSchema,
  restaurantSchema,
  storeSchema,
} from '@/components/organization/shared/schemas';

export type ActiveFilter = '' | 'active' | 'inactive';

export type BadgeVariant = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export type OnlinePaymentFilter = '' | OnlinePaymentOption;

export type LocationDisplaySource = Pick<
  HospitalRecord,
  'hospitalCode' | 'hospitalName' | 'id' | 'isActive'
> &
  Partial<
    Pick<
      HospitalRecord,
      | 'billPrefix'
      | 'city'
      | 'displayName'
      | 'invoicePrefix'
      | 'locationCode'
      | 'postalCode'
      | 'state'
      | 'title'
    >
  >;

export type RestaurantOptionBadge = {
  label: string;
  variant: BadgeVariant;
};

export type HospitalFormValues = z.infer<typeof hospitalSchema>;

export type StoreFormValues = z.infer<typeof storeSchema>;

export type KitchenFormValues = z.infer<typeof kitchenSchema>;

export type RestaurantFormValues = z.infer<typeof restaurantSchema>;

export interface PageHeaderProps {
  action?: ReactNode;
  /** How many records the page lists, beside the title. */
  count?: number;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}
