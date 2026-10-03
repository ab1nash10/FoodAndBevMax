'use client';

import { Button } from '@aahar/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, RefreshCw, Search, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type {
  ApiList,
  ApiResponse,
  Hospital as HospitalRecord,
  HospitalInput,
  ListQuery,
  OnlinePaymentOption,
  Restaurant,
  RestaurantInput,
  SortOrder,
} from '@aahar/api-client';
import { AppPageHeader } from '@/components/design-system';
import { Badge, Field, FieldError, Input, Label, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import { getCitiesForState, INDIAN_STATES } from '@/lib/india-locations';
import { useDebouncedValue, useUrlNumberParam, useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

export const listLimit = 10;
export const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
export const restaurantImageMaxSizeBytes = 5 * 1024 * 1024;
export const restaurantImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength, `Use ${maxLength} characters or fewer.`);
export const optionalEmail = z
  .string()
  .trim()
  .max(255, 'Use 255 characters or fewer.')
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address.',
  });
export const postalCodeSchema = z
  .string()
  .trim()
  .max(6, 'Postal code must be 6 digits.')
  .refine((value) => !value || /^\d{6}$/.test(value), {
    message: 'Postal code must be 6 digits.',
  });
export const onlinePaymentOptions: Array<{ label: string; value: OnlinePaymentOption }> = [
  { label: 'None', value: 'NONE' },
  { label: 'PayU', value: 'PAYU' },
  { label: 'RazorPay', value: 'RAZORPAY' },
];
export const freezeServicesMessage =
  'Turning this off will freeze related services. Existing records will remain visible. Continue?';
export const inactiveLocationMessage =
  'This Location is inactive. Services for this Location are currently frozen.';

export const hospitalSchema = z.object({
  address: z.string().trim().min(1, 'Address is required.').max(500),
  area: optionalText(50),
  city: z.string().trim().min(1, 'City is required.').max(100),
  displayName: z.string().trim().min(1, 'Display name is required.').max(255),
  invoicePrefix: optionalText(50),
  ipAddress: optionalText(100),
  isActive: z.boolean(),
  latitude: optionalText(50),
  locationCode: z.string().trim().min(1, 'Location code is required.').max(50),
  longitude: optionalText(50),
  onlinePaymentOption: z.enum(['NONE', 'PAYU', 'RAZORPAY']),
  postalCode: postalCodeSchema,
  state: z.string().trim().min(1, 'State is required.').max(100),
  title: z.string().trim().min(1, 'Title is required.').max(255),
  visitingCardAddress: optionalText(500),
});

export const locationSchema = z.object({
  address: optionalText(255),
  area: optionalText(100),
  building: optionalText(100),
  floor: optionalText(50),
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  locationName: z.string().trim().min(1, 'Location name is required.').max(150),
});

export const storeSchema = z.object({
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  storeName: z.string().trim().min(1, 'Store name is required.').max(150),
});

export const kitchenSchema = z.object({
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  kitchenName: z.string().trim().min(1, 'Kitchen name is required.').max(150),
});

export const restaurantSchema = z.object({
  accountNumber: optionalText(100),
  address: optionalText(255),
  bankNameBranch: optionalText(255),
  email: optionalEmail,
  fssaiNumbers: optionalText(500),
  gstNumber: optionalText(50),
  hospitalId: z.string().uuid('Select a location.'),
  ifscCode: optionalText(50),
  isAtTableDiningEnabled: z.boolean(),
  isDeliveryEnabled: z.boolean(),
  isHomeDeliveryEnabled: z.boolean(),
  isInCarDiningEnabled: z.boolean(),
  isInRoomDiningEnabled: z.boolean(),
  isInventoryEnabled: z.boolean(),
  isOffline: z.boolean(),
  isOnlineOrdersEnabled: z.boolean(),
  isOpen24x7: z.boolean(),
  isPosOrdersEnabled: z.boolean(),
  isRegisteredInGst: z.boolean(),
  isTakeawayEnabled: z.boolean(),
  isVegOnly: z.boolean(),
  isActive: z.boolean(),
  legalName: optionalText(255),
  mobile: optionalText(30),
  panNumber: optionalText(50),
  restaurantName: z.string().trim().min(1, 'Restaurant name is required.').max(150),
  sodexoMid: optionalText(100),
  sodexoTid: optionalText(100),
  sunBu: optionalText(100),
  sunT1: optionalText(100),
  sunT2: optionalText(100),
  unitNameForQr: optionalText(255),
  upiId: optionalText(255),
});

export const counterSchema = z.object({
  counterCode: z.string().trim().min(1, 'Counter code is required.').max(50),
  counterName: z.string().trim().min(1, 'Counter name is required.').max(150),
  hospitalId: z.string().uuid('Select a location.'),
  isActive: z.boolean(),
  paymentDeviceId: optionalText(100),
  pineLabsDeviceId: optionalText(100),
  posDeviceId: optionalText(100),
  restaurantId: z.string().uuid('Select a restaurant.'),
});

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
export type LocationFormValues = z.infer<typeof locationSchema>;
export type StoreFormValues = z.infer<typeof storeSchema>;
export type KitchenFormValues = z.infer<typeof kitchenSchema>;
export type RestaurantFormValues = z.infer<typeof restaurantSchema>;
export type CounterFormValues = z.infer<typeof counterSchema>;

export interface PageHeaderProps {
  action?: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}

export interface EntityColumn<TItem> {
  className?: string;
  header: string;
  render: (item: TItem) => ReactNode;
}

export interface EntityListConfig<
  TItem extends { id: string; isActive: boolean; updatedAt: string },
> {
  columns: EntityColumn<TItem>[];
  createHref: string;
  createLabel?: string;
  entityKey: string;
  emptyLabel: string;
  icon: LucideIcon;
  list: (query: ListQuery) => Promise<ApiResponse<ApiList<TItem>>>;
  sortOptions: Array<{ label: string; value: string }>;
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

export const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') {
    return true;
  }

  if (value === 'inactive') {
    return false;
  }

  return undefined;
}

export function applyValidationErrors<TFormValues extends FieldValues>(
  form: UseFormReturn<TFormValues>,
  error: ZodError,
) {
  form.clearErrors();

  error.issues.forEach((issue) => {
    const fieldName = issue.path[0];

    if (typeof fieldName === 'string') {
      form.setError(fieldName as Path<TFormValues>, {
        message: issue.message,
      });
    }
  });
}

export function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function optionalValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

export function getLocationTitle(hospital: LocationDisplaySource): string {
  return hospital.title ?? hospital.hospitalName;
}

export function getLocationCode(hospital: LocationDisplaySource): string {
  return hospital.locationCode ?? hospital.hospitalCode;
}

export function getLocationDisplayName(hospital: LocationDisplaySource): string {
  return hospital.displayName ?? getLocationTitle(hospital);
}

export function getLocationInvoicePrefix(hospital: LocationDisplaySource): string | null {
  return hospital.invoicePrefix ?? hospital.billPrefix ?? null;
}

export function getLocationPostalCode(hospital: LocationDisplaySource): string | null {
  return hospital.postalCode ?? null;
}

export function formatLocationOption(hospital: LocationDisplaySource): string {
  const code = getLocationCode(hospital);
  const stateAndPostal = [hospital.state, getLocationPostalCode(hospital)]
    .filter(Boolean)
    .join('-');
  const locationDetails = [hospital.city, stateAndPostal || undefined].filter(Boolean).join(', ');

  return `${code} - ${getLocationTitle(hospital)}${
    locationDetails ? `, ${locationDetails}` : ''
  } (${code})`;
}

export function formatRestaurantLocationDisplay(
  hospital: LocationDisplaySource | null | undefined,
): string {
  if (!hospital) {
    return 'Location not set';
  }

  const code = getLocationCode(hospital);
  const stateAndPostal = [hospital.state, getLocationPostalCode(hospital)]
    .filter(Boolean)
    .join('-');
  const locationDetails = [hospital.city, stateAndPostal || undefined].filter(Boolean).join(', ');
  const primaryText = [code, getLocationDisplayName(hospital)].filter(Boolean).join(' - ');

  return (
    [primaryText, locationDetails || undefined].filter(Boolean).join(', ') || 'Location not set'
  );
}

export function toHospitalFormDefaults(hospital?: HospitalRecord): HospitalFormValues {
  return {
    address: hospital?.address ?? '',
    area: hospital?.area ?? '',
    city: hospital?.city ?? '',
    displayName: hospital ? getLocationDisplayName(hospital) : '',
    invoicePrefix: hospital ? (getLocationInvoicePrefix(hospital) ?? '') : '',
    ipAddress: hospital?.ipAddress ?? '',
    isActive: hospital?.isActive ?? true,
    latitude: hospital?.latitude ?? '',
    locationCode: hospital ? getLocationCode(hospital) : '',
    longitude: hospital?.longitude ?? '',
    onlinePaymentOption: hospital?.onlinePaymentOption ?? 'NONE',
    postalCode: hospital ? (getLocationPostalCode(hospital) ?? '') : '',
    state: hospital?.state ?? '',
    title: hospital ? getLocationTitle(hospital) : '',
    visitingCardAddress: hospital?.visitingCardAddress ?? '',
  };
}

export function toHospitalInput(values: HospitalFormValues): HospitalInput {
  const invoicePrefix = optionalValue(values.invoicePrefix);
  const locationCode = values.locationCode.trim();
  const title = values.title.trim();

  return {
    address: values.address.trim(),
    area: optionalValue(values.area),
    billPrefix: invoicePrefix,
    city: values.city.trim(),
    displayName: values.displayName.trim(),
    hospitalCode: locationCode,
    hospitalName: title,
    invoicePrefix,
    ipAddress: optionalValue(values.ipAddress),
    isActive: values.isActive,
    latitude: optionalValue(values.latitude),
    locationCode,
    longitude: optionalValue(values.longitude),
    onlinePaymentOption: values.onlinePaymentOption,
    postalCode: optionalValue(values.postalCode),
    state: values.state.trim(),
    title,
    visitingCardAddress: optionalValue(values.visitingCardAddress),
  };
}

export function isUuid(value: string | undefined): boolean {
  return z.string().uuid().safeParse(value).success;
}

export function formatRestaurantLocationOption(hospital: HospitalRecord): string {
  return formatLocationOption(hospital);
}

export function hasRequiredText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function nullableText(value: string | null | undefined): string {
  return value || 'Not set';
}

export function isRestaurantOnline(restaurant: Restaurant): boolean {
  return (
    restaurant.isOnlineOrdersEnabled || restaurant.onlineOrders || restaurant.onlineOrderingEnabled
  );
}

export function getRestaurantOptionBadges(restaurant: Restaurant): RestaurantOptionBadge[] {
  const badges: RestaurantOptionBadge[] = [
    {
      label: restaurant.isActive ? 'Active' : 'Inactive',
      variant: restaurant.isActive ? 'success' : 'danger',
    },
  ];
  const enabledOptions: Array<RestaurantOptionBadge & { enabled: boolean }> = [
    { enabled: isRestaurantOnline(restaurant), label: 'Online', variant: 'info' },
    {
      enabled: restaurant.isOpen24x7 || restaurant.open24x7,
      label: 'Open 24x7',
      variant: 'info',
    },
    {
      enabled:
        restaurant.isInRoomDiningEnabled ||
        restaurant.inRoomDining ||
        restaurant.inRoomDiningEnabled,
      label: 'In Room Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isPosOrdersEnabled || restaurant.posOrders,
      label: 'POS Orders',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isInventoryEnabled || restaurant.inventory,
      label: 'Inventory',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isVegOnly || restaurant.vegOnly,
      label: 'Veg Only',
      variant: 'success',
    },
    {
      enabled: restaurant.isTakeawayEnabled || restaurant.takeaway,
      label: 'Takeaway',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isDeliveryEnabled || restaurant.delivery,
      label: 'Delivery',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isHomeDeliveryEnabled || restaurant.homeDelivery,
      label: 'Home Delivery',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isAtTableDiningEnabled || restaurant.atTableDining,
      label: 'At Table Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isInCarDiningEnabled || restaurant.inCarDining,
      label: 'In Car Dining',
      variant: 'neutral',
    },
    {
      enabled: restaurant.isOffline || restaurant.offline,
      label: 'Offline',
      variant: 'warning',
    },
  ];

  badges.push(
    ...enabledOptions
      .filter((option) => option.enabled)
      .map(({ enabled: _enabled, ...option }) => option),
  );

  return badges;
}

export function getRestaurantImageError(file: File): string | undefined {
  if (!restaurantImageTypes.includes(file.type)) {
    return 'Choose a JPG, PNG, or WEBP image.';
  }

  if (file.size > restaurantImageMaxSizeBytes) {
    return 'Image must be 5MB or smaller.';
  }

  return undefined;
}

export function isObjectUrl(value: string | undefined): value is string {
  return Boolean(value?.startsWith('blob:'));
}

export async function uploadRestaurantImage(file: File): Promise<string> {
  const formData = new FormData();

  formData.append('file', file);

  // withBasePath: Next's basePath does not apply to a raw fetch.
  const response = await fetch(withBasePath('/api/uploads/restaurant-images'), {
    body: formData,
    method: 'POST',
  });
  const body = (await response.json().catch(() => null)) as {
    message?: string;
    url?: string;
  } | null;

  if (!response.ok || !body?.url) {
    throw new Error(body?.message ?? 'Unable to upload image.');
  }

  return body.url;
}

export const restaurantFormDefaultValues: RestaurantFormValues = {
  accountNumber: '',
  address: '',
  bankNameBranch: '',
  email: '',
  fssaiNumbers: '',
  gstNumber: '',
  hospitalId: '',
  ifscCode: '',
  isAtTableDiningEnabled: false,
  isDeliveryEnabled: false,
  isHomeDeliveryEnabled: false,
  isInCarDiningEnabled: false,
  isInRoomDiningEnabled: false,
  isInventoryEnabled: false,
  isOffline: false,
  isOnlineOrdersEnabled: false,
  isOpen24x7: false,
  isPosOrdersEnabled: false,
  isRegisteredInGst: false,
  isTakeawayEnabled: false,
  isVegOnly: false,
  isActive: true,
  legalName: '',
  mobile: '',
  panNumber: '',
  restaurantName: '',
  sodexoMid: '',
  sodexoTid: '',
  sunBu: '',
  sunT1: '',
  sunT2: '',
  unitNameForQr: '',
  upiId: '',
};

export function toRestaurantFormDefaults(restaurant?: Restaurant): RestaurantFormValues {
  if (!restaurant) {
    return { ...restaurantFormDefaultValues };
  }

  return {
    accountNumber: restaurant.accountNumber ?? '',
    address: restaurant.gstAddress ?? restaurant.address ?? '',
    bankNameBranch: restaurant.bankNameBranch ?? restaurant.bankName ?? '',
    email: restaurant.email ?? '',
    fssaiNumbers: restaurant.fssaiNumbers ?? restaurant.fssaiNumber ?? '',
    gstNumber: restaurant.gstNumber ?? '',
    hospitalId: restaurant.hospitalId,
    ifscCode: restaurant.ifscCode ?? '',
    isActive: restaurant.isActive,
    isAtTableDiningEnabled: restaurant.isAtTableDiningEnabled ?? restaurant.atTableDining,
    isDeliveryEnabled: restaurant.isDeliveryEnabled ?? restaurant.delivery,
    isHomeDeliveryEnabled: restaurant.isHomeDeliveryEnabled ?? restaurant.homeDelivery,
    isInCarDiningEnabled: restaurant.isInCarDiningEnabled ?? restaurant.inCarDining,
    isInRoomDiningEnabled: restaurant.isInRoomDiningEnabled ?? restaurant.inRoomDiningEnabled,
    isInventoryEnabled: restaurant.isInventoryEnabled ?? restaurant.inventory,
    isOffline: restaurant.isOffline ?? restaurant.offline,
    isOnlineOrdersEnabled: isRestaurantOnline(restaurant),
    isOpen24x7: restaurant.isOpen24x7 ?? restaurant.open24x7,
    isPosOrdersEnabled: restaurant.isPosOrdersEnabled ?? restaurant.posOrders,
    isRegisteredInGst: restaurant.isRegisteredInGst,
    isTakeawayEnabled: restaurant.isTakeawayEnabled ?? restaurant.takeaway,
    isVegOnly: restaurant.isVegOnly ?? restaurant.vegOnly,
    legalName: restaurant.legalName ?? '',
    mobile: restaurant.mobile ?? '',
    panNumber: restaurant.panNumber ?? '',
    restaurantName: restaurant.restaurantName,
    sodexoMid: restaurant.sodexoMid ?? '',
    sodexoTid: restaurant.sodexoTid ?? '',
    sunBu: restaurant.sunBu ?? '',
    sunT1: restaurant.sunT1 ?? '',
    sunT2: restaurant.sunT2 ?? '',
    unitNameForQr: restaurant.unitNameForQr ?? restaurant.qrUnitName ?? '',
    upiId: restaurant.upiId ?? '',
  };
}

export function toRestaurantInput(
  values: RestaurantFormValues,
  imageUrls: { coverImageUrl?: string; thumbnailUrl?: string } = {},
): RestaurantInput {
  const address = optionalValue(values.address);

  return {
    accountNumber: optionalValue(values.accountNumber),
    address,
    bankNameBranch: optionalValue(values.bankNameBranch),
    coverImageUrl: imageUrls.coverImageUrl,
    email: optionalValue(values.email),
    fssaiNumbers: optionalValue(values.fssaiNumbers),
    gstAddress: address,
    gstNumber: optionalValue(values.gstNumber),
    hospitalId: values.hospitalId,
    ifscCode: optionalValue(values.ifscCode),
    isActive: values.isActive,
    isAtTableDiningEnabled: values.isAtTableDiningEnabled,
    isDeliveryEnabled: values.isDeliveryEnabled,
    isHomeDeliveryEnabled: values.isHomeDeliveryEnabled,
    isInCarDiningEnabled: values.isInCarDiningEnabled,
    isInRoomDiningEnabled: values.isInRoomDiningEnabled,
    isInventoryEnabled: values.isInventoryEnabled,
    isOffline: values.isOffline,
    isOnlineOrdersEnabled: values.isOnlineOrdersEnabled,
    isOpen24x7: values.isOpen24x7,
    isPosOrdersEnabled: values.isPosOrdersEnabled,
    isRegisteredInGst: values.isRegisteredInGst,
    isTakeawayEnabled: values.isTakeawayEnabled,
    isVegOnly: values.isVegOnly,
    legalName: optionalValue(values.legalName),
    mobile: optionalValue(values.mobile),
    panNumber: optionalValue(values.panNumber),
    restaurantName: values.restaurantName.trim(),
    sodexoMid: optionalValue(values.sodexoMid),
    sodexoTid: optionalValue(values.sodexoTid),
    sunBu: optionalValue(values.sunBu),
    sunT1: optionalValue(values.sunT1),
    sunT2: optionalValue(values.sunT2),
    thumbnailUrl: imageUrls.thumbnailUrl,
    unitNameForQr: optionalValue(values.unitNameForQr),
    upiId: optionalValue(values.upiId),
  };
}

export function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

export function PageHeader({ action, eyebrow, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} description={subtitle} eyebrow={eyebrow} title={title} />;
}

export function ToolbarGrid({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // One wrapping row: search grows, filters keep a fixed width, buttons keep their own size.
    <div className="flex flex-wrap items-center gap-3 border-b border-ds-divider p-4 *:w-full sm:[&>*:first-child]:min-w-[200px] sm:[&>*:first-child]:flex-1 sm:*:w-36 [&>button]:w-auto sm:[&>*:first-child]:w-auto">
      {children}
    </div>
  );
}

export function FlexibleToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid gap-3 border-b border-ds-divider p-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1fr)_150px_170px_170px_170px_150px_130px_auto]">
      {children}
    </div>
  );
}

export function StatusToggleButton({
  disabled,
  isActive,
  onToggle,
}: Readonly<{
  disabled: boolean;
  isActive: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      aria-checked={isActive}
      aria-label={isActive ? 'Set inactive' : 'Set active'}
      className={cn(
        'inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary/40 disabled:cursor-not-allowed disabled:opacity-60',
        isActive ? 'border-ds-teal bg-ds-teal' : 'border-ds-input bg-ds-divider',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'h-[18px] w-[18px] rounded-full bg-white shadow-xs transition',
          isActive ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function StatusToggleCell({
  disabled,
  isActive,
  onToggle,
  showFrozenMessage,
}: Readonly<{
  disabled: boolean;
  isActive: boolean;
  onToggle: () => void;
  showFrozenMessage?: boolean;
}>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <StatusBadge isActive={isActive} />
        <StatusToggleButton disabled={disabled} isActive={isActive} onToggle={onToggle} />
      </div>
      {showFrozenMessage ? (
        <p className="max-w-xs text-xs font-medium text-ds-status-pending-fg">
          {inactiveLocationMessage}
        </p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  onChange,
  value,
}: Readonly<{
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-10"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        type="search"
        value={value}
      />
    </div>
  );
}

export function ActiveFilterSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: ActiveFilter) => void;
  value: ActiveFilter;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as ActiveFilter)} value={value}>
      <option value="">All status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </Select>
  );
}

export function SortOrderSelect({
  onChange,
  value,
}: Readonly<{
  onChange: (value: SortOrder) => void;
  value: SortOrder;
}>) {
  return (
    <Select onChange={(event) => onChange(event.target.value as SortOrder)} value={value}>
      <option value="desc">Newest first</option>
      <option value="asc">Oldest first</option>
    </Select>
  );
}

export function QueryState({
  colSpan,
  error,
  isError,
  isLoading,
  label,
}: Readonly<{
  colSpan: number;
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  label: string;
}>) {
  if (isLoading) {
    return (
      <>
        {skeletonRows.map((row) => (
          <tr key={row}>
            <td className="px-4 py-3" colSpan={colSpan}>
              <Skeleton className="h-8 w-full" />
            </td>
          </tr>
        ))}
      </>
    );
  }

  if (isError) {
    return (
      <tr>
        <td className="px-4 py-12 text-center text-sm text-ds-status-bad-fg" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto max-w-sm">
          <p className="text-sm font-bold text-ds-text">No {label} found</p>
          <p className="mt-1 text-sm text-ds-muted">Create a record or adjust the filters.</p>
        </div>
      </td>
    </tr>
  );
}

export function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t border-ds-divider px-4 py-3 text-sm text-ds-text-3 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {safeTotalPages} - {total} records - {limit} per page
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
          disabled={page >= safeTotalPages}
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

export function FormShell({
  backHref,
  children,
  icon,
  subtitle,
  title,
}: Readonly<{
  backHref: string;
  children: ReactNode;
  icon: LucideIcon;
  subtitle: string;
  title: string;
}>) {
  const Icon = icon;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost">
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>
      <PageHeader eyebrow="Organization" icon={Icon} subtitle={subtitle} title={title} />
      <Panel className="p-4 sm:p-5">{children}</Panel>
    </section>
  );
}

export function SectionHeading({ title }: Readonly<{ title: string }>) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-ds-teal-text">{title}</h2>
  );
}

export function SubmitButton({
  disabled = false,
  isPending,
  label,
}: Readonly<{
  disabled?: boolean;
  isPending: boolean;
  label: string;
}>) {
  return (
    <Button disabled={disabled || isPending} type="submit">
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </Button>
  );
}

export function FormWarning({
  isVisible,
  message,
}: Readonly<{
  isVisible: boolean;
  message: string;
}>) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="rounded-control bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
      {message}
    </div>
  );
}

export function CheckboxLine({
  children,
  input,
}: Readonly<{
  children: ReactNode;
  input: ReactNode;
}>) {
  return (
    <label className="flex min-h-control items-center gap-3 rounded-control border border-ds-border bg-ds-surface px-3.5 text-sm font-medium text-ds-text-2">
      {input}
      {children}
    </label>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-28 w-full rounded-control border border-ds-input bg-ds-surface px-3.5 py-2.5 text-sm text-ds-text outline-hidden transition placeholder:text-ds-muted focus:border-ds-primary focus:ring-2 focus:ring-ds-primary/15 disabled:cursor-not-allowed disabled:bg-ds-subtle disabled:text-ds-muted',
        className,
      )}
      {...props}
    />
  );
}

export function LocationMasterFormFields({
  disabled = false,
  form,
}: Readonly<{
  disabled?: boolean;
  form: UseFormReturn<HospitalFormValues>;
}>) {
  const selectedState = form.watch('state');
  const selectedCity = form.watch('city');
  const cityOptions = getCitiesForState(selectedState);

  useEffect(() => {
    if (selectedCity && cityOptions.length > 0 && !cityOptions.includes(selectedCity)) {
      form.setValue('city', '');
    }
  }, [cityOptions, form, selectedCity]);

  return (
    <div className="grid gap-6">
      <SectionHeading title="Add/Update Location" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field error={form.formState.errors.title?.message} label="Title" name="location-title">
          <Input disabled={disabled} id="location-title" {...form.register('title')} />
        </Field>
        <Field
          error={form.formState.errors.locationCode?.message}
          label="Location Code"
          name="location-code"
        >
          <Input
            disabled={disabled}
            id="location-code"
            placeholder="DEL-01"
            {...form.register('locationCode')}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          error={form.formState.errors.displayName?.message}
          label="Display Name"
          name="location-display-name"
        >
          <Input disabled={disabled} id="location-display-name" {...form.register('displayName')} />
        </Field>
        <Field
          error={form.formState.errors.invoicePrefix?.message}
          label="Invoice Prefix"
          name="location-invoice-prefix"
        >
          <Input
            disabled={disabled}
            id="location-invoice-prefix"
            placeholder="eg. MAX-LKO or INV-LKO"
            {...form.register('invoicePrefix')}
          />
        </Field>
      </div>
      <Field error={form.formState.errors.address?.message} label="Address" name="location-address">
        <Textarea disabled={disabled} id="location-address" {...form.register('address')} />
      </Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field error={form.formState.errors.state?.message} label="State" name="location-state">
          <Select disabled={disabled} id="location-state" {...form.register('state')}>
            <option value="">Select state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </Field>
        <Field error={form.formState.errors.city?.message} label="City" name="location-city">
          <Select
            disabled={disabled || !selectedState}
            id="location-city"
            {...form.register('city')}
          >
            <option value="">Select city</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.postalCode?.message}
          label="Postal Code"
          name="location-postal-code"
        >
          <Input
            disabled={disabled}
            id="location-postal-code"
            inputMode="numeric"
            maxLength={6}
            placeholder="226010"
            {...form.register('postalCode')}
          />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Field error={form.formState.errors.latitude?.message} label="Latitude" name="latitude">
          <Input disabled={disabled} id="latitude" {...form.register('latitude')} />
        </Field>
        <Field error={form.formState.errors.longitude?.message} label="Longitude" name="longitude">
          <Input disabled={disabled} id="longitude" {...form.register('longitude')} />
        </Field>
        <Field error={form.formState.errors.area?.message} label="Area" name="location-area">
          <Input
            disabled={disabled}
            id="location-area"
            placeholder="0"
            {...form.register('area')}
          />
        </Field>
        <Field
          error={form.formState.errors.ipAddress?.message}
          label="IP Address"
          name="location-ip-address"
        >
          <Input disabled={disabled} id="location-ip-address" {...form.register('ipAddress')} />
        </Field>
      </div>
      <Field
        error={form.formState.errors.visitingCardAddress?.message}
        label="Address for Visiting Card"
        name="visiting-card-address"
      >
        <Textarea
          disabled={disabled}
          id="visiting-card-address"
          {...form.register('visitingCardAddress')}
        />
      </Field>
      <div className="space-y-3">
        <Label className="block" htmlFor="online-payment-option">
          Online Payment Option
        </Label>
        <div className="grid gap-3 sm:grid-cols-3" id="online-payment-option">
          {onlinePaymentOptions.map((option) => (
            <CheckboxLine
              input={
                <input
                  className="h-4 w-4"
                  disabled={disabled}
                  type="radio"
                  value={option.value}
                  {...form.register('onlinePaymentOption')}
                />
              }
              key={option.value}
            >
              {option.label}
            </CheckboxLine>
          ))}
        </div>
        <FieldError>{form.formState.errors.onlinePaymentOption?.message}</FieldError>
      </div>
      <CheckboxLine
        input={
          <input
            className="h-4 w-4"
            disabled={disabled}
            type="checkbox"
            {...form.register('isActive')}
          />
        }
      >
        Active
      </CheckboxLine>
    </div>
  );
}

export function ImageUploadField({
  error,
  id,
  label,
  onChange,
  previewUrl,
}: Readonly<{
  error?: string;
  id: string;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  previewUrl?: string;
}>) {
  return (
    <div className="[&>*+*]:mt-2">
      <label className="text-sm font-semibold text-ds-text" htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-col gap-3 rounded-md border border-ds-border bg-white p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline">
            <label className="cursor-pointer" htmlFor={id}>
              Choose
            </label>
          </Button>
          <span className="text-xs text-ds-muted">JPG, PNG, or WEBP. Max 5MB.</span>
        </div>
        <input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={id}
          onChange={onChange}
          type="file"
        />
        {previewUrl ? (
          <div
            aria-label={`${label} preview`}
            className="h-32 w-full rounded-md border border-ds-divider bg-cover bg-center"
            role="img"
            style={{ backgroundImage: `url(${previewUrl})` }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-ds-border bg-ds-subtle text-sm text-ds-muted">
            No image selected
          </div>
        )}
      </div>
      {error ? <p className="text-sm font-medium text-ds-status-bad-fg">{error}</p> : null}
    </div>
  );
}

export function EntityListPage<TItem extends { id: string; isActive: boolean; updatedAt: string }>({
  config,
}: Readonly<{ config: EntityListConfig<TItem> }>) {
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState(config.sortOptions[0]?.value ?? 'createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const entityQuery = useQuery({
    queryFn: async () => {
      const response = await config.list({
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: [config.entityKey, { activeFilter, page, search, sortBy, sortOrder }],
  });

  const items = entityQuery.data?.items ?? [];
  const meta = entityQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild>
            <Link href={config.createHref}>
              <Plus className="h-4 w-4" />
              {config.createLabel ?? 'Create'}
            </Link>
          </Button>
        }
        eyebrow="Organization"
        icon={config.icon}
        subtitle={config.subtitle}
        title={config.title}
      />
      <Panel>
        <ToolbarGrid>
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            {config.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void entityQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </ToolbarGrid>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                {config.columns.map((column) => (
                  <th className={cn('px-4 py-3', column.className)} key={column.header}>
                    {column.header}
                  </th>
                ))}
                <th className="w-[120px] px-4 py-2.5">Status</th>
                <th className="w-[160px] px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((item) => (
                  <tr className="hover:bg-ds-subtle" key={item.id}>
                    {config.columns.map((column) => (
                      <td className="px-4 py-3 text-ds-text-3" key={column.header}>
                        {column.render(item)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <StatusBadge isActive={item.isActive} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-muted">
                      {formatDate(item.updatedAt)}
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={config.columns.length + 2}
                  error={entityQuery.error}
                  isError={entityQuery.isError}
                  isLoading={entityQuery.isLoading}
                  label={config.emptyLabel}
                />
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          limit={meta.limit}
          onPageChange={setPage}
          page={meta.page}
          total={meta.total}
          totalPages={meta.totalPages}
        />
      </Panel>
    </section>
  );
}

export function useHospitalOptions() {
  return useQuery<HospitalRecord[]>({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'title',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['hospital-options'],
  });
}

export function useRestaurantOptions(hospitalId?: string) {
  return useQuery<Restaurant[]>({
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId,
        isActive: true,
        limit: 100,
        sortBy: 'restaurantName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['restaurant-options', hospitalId],
  });
}

export function useEntityTotal(
  queryKey: string | readonly unknown[],
  queryFn: () => Promise<ApiResponse<ApiList<unknown>>>,
  enabled = true,
) {
  const queryKeyParts = typeof queryKey === 'string' ? [queryKey] : queryKey;

  return useQuery({
    enabled,
    queryFn: async () => {
      const response = await queryFn();

      return response.data.meta.total;
    },
    queryKey: ['dashboard', ...queryKeyParts],
  });
}
