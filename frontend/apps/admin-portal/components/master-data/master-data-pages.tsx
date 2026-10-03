'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  IndianRupee,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { z, type ZodError } from 'zod';
import type {
  ApiList,
  ApiResponse,
  Employee,
  EmployeeInput,
  FoodType,
  Hospital,
  Item,
  ItemCategory,
  ItemCategoryInput,
  ItemInput,
  ItemPrice,
  ItemPriceInput,
  ItemType,
  ListQuery,
  RateType,
  Restaurant,
  SortOrder,
} from '@aahar/api-client';
import { AppPageHeader, EmptyState, FoodTypeMarker } from '@/components/design-system';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, FieldError, Input, Panel, Select, Skeleton } from '@/components/ui';
import {
  DetailPanel,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Modal,
  SavedViewTabs,
  SegmentedControl,
  Toggle,
} from '@/components/ui-controls';
import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useAuth } from '@/components/auth-provider';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { IfCanOpen, RecordLink } from '@/components/record-link';
import { locationHref, recordHref } from '@/lib/navigation';
import {
  openRowLink,
  setUrlParams,
  useDebouncedValue,
  useHrefWith,
  useOnScopeChange,
  useUrlNumberParam,
  useUrlParam,
} from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import {
  invalidateEmployeeQueries,
  invalidateItemCategoryQueries,
  invalidateItemPriceQueries,
  invalidateItemQueries,
} from '@/lib/query-invalidation';

const listLimit = 10;
const skeletonRows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'];
const foodTypeValues = ['VEG', 'NON_VEG', 'EGGETARIAN'] as const;
const itemTypeValues = ['MRP', 'READYMADE', 'LIVE'] as const;
const rateTypeValues = ['NORMAL', 'STAFF', 'ROOM', 'COUNTER'] as const;
const gstPercentValues = ['0', '5', '12', '18'] as const;
const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength, `Use ${maxLength} characters or fewer.`);

const categorySchema = z.object({
  categoryName: z.string().trim().min(1, 'Category name is required.').max(255),
  isActive: z.boolean(),
});

const foodTypeSchema = z.custom<FoodType>((value) => foodTypeValues.includes(value as FoodType), {
  message: 'Select type.',
});

const itemTypeSchema = z.custom<ItemType>((value) => itemTypeValues.includes(value as ItemType), {
  message: 'Select item type.',
});

const rateTypeSchema = z.custom<RateType>((value) => rateTypeValues.includes(value as RateType), {
  message: 'Select rate type.',
});

const itemSchema = z.object({
  categoryId: z.string().uuid('Select a category.'),
  hsnCode: optionalText(50),
  isActive: z.boolean(),
  itemName: z.string().trim().min(1, 'Item name is required.').max(255),
  itemType: itemTypeSchema,
  preparationTimeMinutes: z
    .string()
    .trim()
    .regex(/^$|^\d+$/, 'Use a whole number.')
    .transform((value) => (value ? Number(value) : undefined)),
  type: foodTypeSchema,
});

const itemPriceSchema = z
  .object({
    effectiveFrom: z.string().trim().min(1, 'Effective From is required.'),
    effectiveTo: optionalText(20),
    gstPercent: z.string().trim(),
    hospitalId: z.string().uuid('Select a location.'),
    isActive: z.boolean(),
    isTaxInclusive: z.boolean(),
    itemId: z.string().uuid('Select an item.'),
    price: z
      .string()
      .trim()
      .min(1, 'Price is required.')
      .refine((value) => Number(value) > 0, 'Price must be greater than 0.')
      .transform((value) => Number(value)),
    rateType: rateTypeSchema,
    restaurantId: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.isTaxInclusive && !values.gstPercent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select GST Percentage.',
        path: ['gstPercent'],
      });
    }

    if (
      values.gstPercent &&
      !gstPercentValues.includes(values.gstPercent as (typeof gstPercentValues)[number])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GST Percentage must be one of 0, 5, 12, or 18.',
        path: ['gstPercent'],
      });
    }

    if (
      values.effectiveTo &&
      new Date(values.effectiveTo).getTime() <= new Date(values.effectiveFrom).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Effective To must be greater than Effective From.',
        path: ['effectiveTo'],
      });
    }
  });

const employeeSchema = z.object({
  department: optionalText(255),
  designation: optionalText(255),
  eligibleForDiscount: z.boolean(),
  employeeCode: z.string().trim().min(1, 'Employee code is required.').max(100),
  employeeName: z.string().trim().min(1, 'Employee name is required.').max(255),
  isActive: z.boolean(),
  mobile: optionalText(20),
});

type ActiveFilter = '' | 'active' | 'inactive';
type DiscountFilter = '' | 'eligible' | 'notEligible';
type FoodTypeFilter = '' | FoodType;
type ItemTypeFilter = '' | ItemType;
type RateTypeFilter = '' | RateType;
type EmployeeFormValues = z.infer<typeof employeeSchema>;
type ItemCategoryFormValues = z.infer<typeof categorySchema>;
type ItemPriceParsedValues = z.infer<typeof itemPriceSchema>;
type ItemPriceItemOption = Pick<Item, 'id' | 'itemCode' | 'itemName' | 'itemType'>;

interface ItemFormValues {
  categoryId: string;
  hsnCode: string;
  isActive: boolean;
  itemCode: string;
  itemName: string;
  itemType: ItemTypeFilter;
  preparationTimeMinutes: string;
  type: FoodTypeFilter;
}

interface ItemPriceFormValues {
  effectiveFrom: string;
  effectiveTo: string;
  gstPercent: string;
  hospitalId: string;
  isActive: boolean;
  isTaxInclusive: boolean;
  itemId: string;
  price: string;
  rateType: RateTypeFilter;
  restaurantId: string;
}

function toItemPricePayload(values: ItemPriceParsedValues): ItemPriceInput {
  return {
    effectiveFrom: values.effectiveFrom,
    effectiveTo: optionalValue(values.effectiveTo) ?? null,
    gstPercent: values.isTaxInclusive ? Number(values.gstPercent) : undefined,
    hospitalId: values.hospitalId,
    isActive: values.isActive,
    isTaxInclusive: values.isTaxInclusive,
    itemId: values.itemId,
    price: values.price,
    rateType: values.rateType,
    restaurantId: optionalValue(values.restaurantId) ?? null,
  };
}

interface PageHeaderProps {
  action?: ReactNode;
  eyebrow: string;
  icon: LucideIcon;
  subtitle?: string;
  title: string;
}

interface PaginationControlsProps {
  limit: number;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
});
const timeOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
});

function activeFilterToBoolean(value: ActiveFilter): boolean | undefined {
  if (value === 'active') {
    return true;
  }

  if (value === 'inactive') {
    return false;
  }

  return undefined;
}

function discountFilterToBoolean(value: DiscountFilter): boolean | undefined {
  if (value === 'eligible') {
    return true;
  }

  if (value === 'notEligible') {
    return false;
  }

  return undefined;
}

function applyValidationErrors<TFormValues extends FieldValues>(
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

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatDateOnly(value: string | null): string {
  return value ? dateOnlyFormatter.format(new Date(value)) : 'Open ended';
}

function formatTimeOnly(value: string): string {
  return timeOnlyFormatter.format(new Date(value));
}

function formatEnum(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function formatLocationOption(hospital: Hospital): string {
  const code = hospital.locationCode || hospital.hospitalCode;
  const name = hospital.displayName || hospital.title || hospital.hospitalName;
  const locality = [hospital.city, hospital.state].filter(Boolean).join(', ');
  const suffix = hospital.postalCode ? `${locality}-${hospital.postalCode}` : locality;

  return [code, [name, suffix].filter(Boolean).join(', ')].filter(Boolean).join(' - ');
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

const similarCategoryError = 'Similar category already exists';
const similarItemError = 'Similar item already exists';
const overlappingItemPriceError =
  'An active price already exists for this item, rate type, and date range.';

function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return (
    <Badge variant={isActive ? 'success' : 'danger'}>{isActive ? 'Active' : 'Inactive'}</Badge>
  );
}

function StatusToggleButton({
  isActive,
  isPending,
  onToggle,
}: Readonly<{
  isActive: boolean;
  isPending: boolean;
  onToggle: () => void;
}>) {
  return (
    <Button
      className={
        isActive
          ? 'border-ds-status-pending-fg/25 text-ds-status-pending-fg hover:bg-ds-status-pending-bg'
          : 'border-ds-teal-border text-ds-teal-text hover:bg-ds-teal-soft'
      }
      disabled={isPending}
      onClick={onToggle}
      size="sm"
      type="button"
      variant="outline"
    >
      {isActive ? 'Turn inactive' : 'Turn active'}
    </Button>
  );
}

function PageHeader({ action, eyebrow, subtitle, title }: PageHeaderProps) {
  return <AppPageHeader action={action} description={subtitle} eyebrow={eyebrow} title={title} />;
}

function SearchInput({
  onChange,
  value,
}: Readonly<{
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-muted" />
      <Input
        className="pl-9"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        type="search"
        value={value}
      />
    </div>
  );
}

function ActiveFilterSelect({
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

function SortOrderSelect({
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

function QueryState({
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
          <p className="text-sm font-semibold text-ds-text">No {label} found</p>
          <p className="mt-1 text-sm text-ds-muted">Create a record or adjust the filters.</p>
        </div>
      </td>
    </tr>
  );
}

function PaginationControls({
  limit,
  onPageChange,
  page,
  total,
  totalPages,
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(totalPages, 1);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-ds-text-3 sm:flex-row sm:items-center sm:justify-between">
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

function CheckboxLine({
  children,
  input,
}: Readonly<{
  children: ReactNode;
  input: ReactNode;
}>) {
  return (
    <label className="flex min-h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-ds-text-2 shadow-xs">
      {input}
      {children}
    </label>
  );
}

function SubmitButton({
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

function FormShell({
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
      <PageHeader eyebrow="Master Data" icon={Icon} subtitle={subtitle} title={title} />
      <Panel className="p-4 sm:p-5">{children}</Panel>
    </section>
  );
}

function useItemCategoryOptions() {
  return useQuery<ItemCategory[]>({
    queryFn: async () => {
      const response = await organizationApi.listItemCategories({
        isActive: true,
        limit: 100,
        sortBy: 'categoryName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['item-category-options'],
  });
}

function useHospitalOptions() {
  return useQuery<Hospital[]>({
    queryFn: async () => {
      const response = await organizationApi.listHospitals({
        isActive: true,
        limit: 100,
        sortBy: 'hospitalName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['location-options'],
  });
}

function useRestaurantOptions(hospitalId?: string) {
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

function useItemOptions(itemType?: ItemTypeFilter, search = '') {
  return useQuery<Item[]>({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        isActive: true,
        itemType: itemType || undefined,
        limit: 100,
        search: optionalValue(search),
        sortBy: 'itemName',
        sortOrder: 'asc',
      });

      return response.data.items;
    },
    queryKey: ['item-options', itemType ?? 'all', search],
  });
}

function useEntityList<TItem>(
  entityKey: string,
  query: ListQuery,
  list: (query: ListQuery) => Promise<ApiResponse<ApiList<TItem>>>,
) {
  return useQuery({
    queryFn: async () => {
      const response = await list(query);

      return response.data;
    },
    queryKey: [entityKey, query],
  });
}

function CategoryFormFields({ form }: Readonly<{ form: UseFormReturn<ItemCategoryFormValues> }>) {
  return (
    <>
      <Field
        error={form.formState.errors.categoryName?.message}
        label="Category Name"
        name="category-name"
      >
        <Input id="category-name" {...form.register('categoryName')} />
      </Field>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}

function itemToFormValues(item: Item): ItemFormValues {
  return {
    categoryId: item.categoryId,
    hsnCode: item.hsnCode ?? '',
    isActive: item.isActive,
    itemCode: item.itemCode,
    itemName: item.itemName,
    itemType: item.itemType,
    preparationTimeMinutes:
      item.preparationTimeMinutes === null ? '' : String(item.preparationTimeMinutes),
    type: item.type,
  };
}

function emptyItemFormValues(): ItemFormValues {
  return {
    categoryId: '',
    hsnCode: '',
    isActive: true,
    itemCode: '',
    itemName: '',
    itemType: '',
    preparationTimeMinutes: '',
    type: '',
  };
}

const foodTypeFormLabels: Record<(typeof foodTypeValues)[number], string> = {
  EGGETARIAN: 'Egg',
  NON_VEG: 'Non-veg',
  VEG: 'Veg',
};

function ItemFormFields({
  categories,
  form,
}: Readonly<{
  categories: ItemCategory[] | undefined;
  form: UseFormReturn<ItemFormValues>;
}>) {
  // At most two columns, so the same fields fit the create page and the side panel.
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={form.formState.errors.itemName?.message} label="Item name" name="item-name">
          <Input id="item-name" placeholder="e.g. Veg Thali" {...form.register('itemName')} />
        </Field>
        <Field label="Item code" name="item-code">
          <Input
            disabled
            id="item-code"
            readOnly
            value={form.watch('itemCode') || 'Auto-generated after save'}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.categoryId?.message}
          label="Category"
          name="item-category"
        >
          <Select id="item-category" {...form.register('categoryId')}>
            <option value="">Select category</option>
            {categories?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.categoryName}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.itemType?.message}
          label="Item type"
          name="item-item-type"
        >
          <Select id="item-item-type" {...form.register('itemType')}>
            <option value="">Select item type</option>
            {itemTypeValues.map((itemType) => (
              <option key={itemType} value={itemType}>
                {formatEnum(itemType)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-semibold leading-none text-ds-text-2">Food type</legend>
        <div className="grid grid-cols-3 gap-2 pt-2">
          {foodTypeValues.map((type) => (
            <label
              className="flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-ds-input bg-ds-surface px-3 text-sm font-medium text-ds-text-2 transition has-checked:border-ds-primary has-checked:bg-ds-primary-soft has-checked:text-ds-link has-focus-visible:ring-2 has-focus-visible:ring-ds-primary"
              key={type}
            >
              <input className="h-4 w-4" type="radio" value={type} {...form.register('type')} />
              {foodTypeFormLabels[type]}
            </label>
          ))}
        </div>
        <FieldError>{form.formState.errors.type?.message}</FieldError>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.preparationTimeMinutes?.message}
          label="Preparation time"
          name="item-preparation-time"
        >
          <Input
            id="item-preparation-time"
            min={0}
            placeholder="Minutes"
            type="number"
            {...form.register('preparationTimeMinutes')}
          />
        </Field>
        <Field error={form.formState.errors.hsnCode?.message} label="HSN code" name="item-hsn-code">
          <Input id="item-hsn-code" {...form.register('hsnCode')} />
        </Field>
      </div>
      <CheckboxLine
        input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
      >
        Active
      </CheckboxLine>
    </>
  );
}

function itemPriceToFormValues(itemPrice: ItemPrice): ItemPriceFormValues {
  return {
    effectiveFrom: itemPrice.effectiveFrom.slice(0, 10),
    effectiveTo: itemPrice.effectiveTo?.slice(0, 10) ?? '',
    gstPercent: itemPrice.gstPercent === null ? '' : String(itemPrice.gstPercent),
    hospitalId: itemPrice.hospitalId,
    isActive: itemPrice.isActive,
    isTaxInclusive: itemPrice.isTaxInclusive,
    itemId: itemPrice.itemId,
    price: String(itemPrice.price),
    rateType: itemPrice.rateType,
    restaurantId: itemPrice.restaurantId ?? '',
  };
}

function emptyItemPriceFormValues(): ItemPriceFormValues {
  return {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    gstPercent: '',
    hospitalId: '',
    isActive: true,
    isTaxInclusive: true,
    itemId: '',
    price: '',
    rateType: '',
    restaurantId: '',
  };
}

function getItemPriceItemOptions(
  items: Item[] | undefined,
  selectedItem?: ItemPriceItemOption,
): ItemPriceItemOption[] | undefined {
  if (!selectedItem) {
    return items;
  }

  if (items?.some((item) => item.id === selectedItem.id)) {
    return items;
  }

  return [selectedItem, ...(items ?? [])];
}

function formatItemPriceItemLabel(item: ItemPriceItemOption): string {
  return `${item.itemName} (${item.itemCode}) - ${formatEnum(item.itemType)}`;
}

function ItemPriceItemCombobox({
  error,
  form,
  isLoading,
  items,
  onSearch,
  search,
}: Readonly<{
  error?: string;
  form: UseFormReturn<ItemPriceFormValues>;
  isLoading?: boolean;
  items: ItemPriceItemOption[] | undefined;
  onSearch: (value: string) => void;
  search: string;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedItemId = form.watch('itemId');
  const selectedItem = items?.find((item) => item.id === selectedItemId);
  const displayValue = search || (selectedItem ? formatItemPriceItemLabel(selectedItem) : '');
  const hasItems = Boolean(items?.length);

  function selectItem(item: ItemPriceItemOption): void {
    const label = formatItemPriceItemLabel(item);

    form.setValue('itemId', item.id, { shouldDirty: true, shouldValidate: true });
    onSearch(label);
    setIsOpen(false);
  }

  return (
    <Field error={error} label="Item *" name="price-item">
      <div className="relative">
        <Input
          aria-autocomplete="list"
          aria-controls="price-item-options"
          aria-expanded={isOpen}
          aria-label="Item"
          autoComplete="off"
          id="price-item"
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onChange={(event) => {
            onSearch(event.target.value);
            form.setValue('itemId', '', { shouldDirty: true, shouldValidate: true });
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Type item name or code"
          role="combobox"
          value={displayValue}
        />
        <input type="hidden" {...form.register('itemId')} />
        {isOpen ? (
          <div
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-md border border-ds-border bg-white py-1 text-sm shadow-lg shadow-ds-text/10"
            id="price-item-options"
            role="listbox"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-ds-muted">Loading active items...</div>
            ) : hasItems ? (
              items?.map((item) => (
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-ds-text-2 hover:bg-ds-teal-soft hover:text-ds-teal-text"
                  key={item.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectItem(item);
                  }}
                  role="option"
                  type="button"
                >
                  <span className="truncate">{formatItemPriceItemLabel(item)}</span>
                  {item.id === selectedItemId ? (
                    <span className="text-xs font-semibold text-ds-teal-text">Selected</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-ds-muted">
                {search ? 'No active items match your search.' : 'No active items found.'}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function ItemPriceFormFields({
  form,
  hospitals,
  isLocationLocked,
  isItemsLoading,
  itemSearch,
  items,
  onItemSearch,
  restaurants,
}: Readonly<{
  form: UseFormReturn<ItemPriceFormValues>;
  hospitals: Hospital[] | undefined;
  isLocationLocked?: boolean;
  isItemsLoading?: boolean;
  itemSearch: string;
  items: ItemPriceItemOption[] | undefined;
  onItemSearch: (value: string) => void;
  restaurants: Restaurant[] | undefined;
}>) {
  const selectedHospitalId = form.watch('hospitalId');
  const isTaxInclusive = form.watch('isTaxInclusive');

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.hospitalId?.message}
          label="Location"
          name="price-location"
        >
          <Select
            disabled={isLocationLocked}
            id="price-location"
            onChange={(event) => {
              form.setValue('hospitalId', event.target.value, { shouldValidate: true });
              form.setValue('restaurantId', '', { shouldValidate: true });
            }}
            value={selectedHospitalId}
          >
            <option value="">Select location</option>
            {hospitals?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          error={form.formState.errors.restaurantId?.message}
          label="Restaurant"
          name="price-restaurant"
        >
          <Select
            disabled={!selectedHospitalId}
            id="price-restaurant"
            {...form.register('restaurantId')}
          >
            <option value="">All restaurants under location</option>
            {restaurants?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName} ({restaurant.restaurantCode})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ItemPriceItemCombobox
          error={form.formState.errors.itemId?.message}
          form={form}
          isLoading={isItemsLoading}
          items={items}
          onSearch={onItemSearch}
          search={itemSearch}
        />
        <Field
          error={form.formState.errors.rateType?.message}
          label="Rate Type"
          name="price-rate-type"
        >
          <Select id="price-rate-type" {...form.register('rateType')}>
            <option value="">Select rate type</option>
            {rateTypeValues.map((rateType) => (
              <option key={rateType} value={rateType}>
                {formatEnum(rateType)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field error={form.formState.errors.price?.message} label="Price" name="price-value">
          <Input
            id="price-value"
            min="0.01"
            placeholder="0.00"
            step="0.01"
            type="number"
            {...form.register('price')}
          />
        </Field>
        {isTaxInclusive ? (
          <Field
            error={form.formState.errors.gstPercent?.message}
            label="GST Percentage"
            name="price-gst-percent"
          >
            <Select id="price-gst-percent" {...form.register('gstPercent')}>
              <option value="">Select GST</option>
              {gstPercentValues.map((gstPercent) => (
                <option key={gstPercent} value={gstPercent}>
                  {gstPercent}%
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field
          error={form.formState.errors.effectiveFrom?.message}
          label="Effective From"
          name="price-effective-from"
        >
          <Input id="price-effective-from" type="date" {...form.register('effectiveFrom')} />
        </Field>
        <Field
          error={form.formState.errors.effectiveTo?.message}
          label="Effective To"
          name="price-effective-to"
        >
          <Input id="price-effective-to" type="date" {...form.register('effectiveTo')} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isTaxInclusive')} />}
        >
          Tax Inclusive
        </CheckboxLine>
        {isTaxInclusive ? (
          <p className="text-sm text-ds-muted">
            If Tax Inclusive is enabled, the entered price already includes GST.
          </p>
        ) : null}
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </div>
    </>
  );
}

function employeeToFormValues(employee: Employee): EmployeeFormValues {
  return {
    department: employee.department ?? '',
    designation: employee.designation ?? '',
    eligibleForDiscount: employee.eligibleForDiscount,
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    isActive: employee.isActive,
    mobile: employee.mobile ?? '',
  };
}

function emptyEmployeeFormValues(): EmployeeFormValues {
  return {
    department: '',
    designation: '',
    eligibleForDiscount: true,
    employeeCode: '',
    employeeName: '',
    isActive: true,
    mobile: '',
  };
}

function EmployeeFormFields({ form }: Readonly<{ form: UseFormReturn<EmployeeFormValues> }>) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.employeeCode?.message}
          label="Employee Code"
          name="employee-code"
        >
          <Input id="employee-code" {...form.register('employeeCode')} />
        </Field>
        <Field
          error={form.formState.errors.employeeName?.message}
          label="Employee Name"
          name="employee-name"
        >
          <Input id="employee-name" {...form.register('employeeName')} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          error={form.formState.errors.department?.message}
          label="Department"
          name="employee-department"
        >
          <Input id="employee-department" {...form.register('department')} />
        </Field>
        <Field
          error={form.formState.errors.designation?.message}
          label="Designation"
          name="employee-designation"
        >
          <Input id="employee-designation" {...form.register('designation')} />
        </Field>
      </div>
      <Field error={form.formState.errors.mobile?.message} label="Mobile" name="employee-mobile">
        <Input id="employee-mobile" inputMode="numeric" {...form.register('mobile')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxLine
          input={
            <input className="h-4 w-4" type="checkbox" {...form.register('eligibleForDiscount')} />
          }
        >
          Eligible For Discount
        </CheckboxLine>
        <CheckboxLine
          input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
        >
          Active
        </CheckboxLine>
      </div>
    </>
  );
}

export function ItemCategoriesPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<ItemCategoryFormValues>({
    defaultValues: {
      categoryName: '',
      isActive: true,
    },
  });

  const categoriesQuery = useEntityList<ItemCategory>(
    'item-categories',
    {
      isActive: activeFilterToBoolean(activeFilter),
      limit: listLimit,
      page,
      search,
      sortBy,
      sortOrder,
    },
    (query) => organizationApi.listItemCategories(query),
  );

  const saveCategoryMutation = useMutation({
    mutationFn: (body: ItemCategoryInput) =>
      editingCategory
        ? organizationApi.updateItemCategory(editingCategory.id, body)
        : organizationApi.createItemCategory(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarCategoryError) {
        form.setError('categoryName', { message });
      }

      showToast({
        description: message,
        title: editingCategory ? 'Category was not updated' : 'Category was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: editingCategory ? 'Category updated' : 'Category created',
        variant: 'success',
      });
      setEditingCategory(null);
      form.reset({
        categoryName: '',
        isActive: true,
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteItemCategory(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Category was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: 'Category deleted',
        variant: 'success',
      });
    },
  });

  const toggleCategoryStatusMutation = useMutation({
    mutationFn: ({ category, isActive }: { category: ItemCategory; isActive: boolean }) =>
      organizationApi.updateItemCategory(category.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Category status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Category activated' : 'Category marked inactive',
        variant: 'success',
      });
    },
  });

  const items = categoriesQuery.data?.items ?? [];
  const meta = categoriesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = categorySchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveCategoryMutation.mutate({
      categoryName: parsed.data.categoryName,
      isActive: parsed.data.isActive,
    });
  });

  function startEditingCategory(category: ItemCategory) {
    setEditingCategory(category);
    form.reset({
      categoryName: category.categoryName,
      isActive: category.isActive,
    });
  }

  function cancelEditingCategory() {
    setEditingCategory(null);
    form.reset({
      categoryName: '',
      isActive: true,
    });
  }

  function deleteCategory(category: ItemCategory) {
    const shouldDelete = window.confirm(`Delete ${category.categoryName}?`);

    if (shouldDelete) {
      deleteCategoryMutation.mutate(category.id);
    }
  }

  function toggleCategoryStatus(category: ItemCategory) {
    const nextIsActive = !category.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this category inactive will prevent it from being used for new items. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleCategoryStatusMutation.mutate({ category, isActive: nextIsActive });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/item-categories/new">
            <Button asChild>
              <Link href="/masters/item-categories/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Master Data"
        icon={Tags}
        subtitle="Configure global item grouping reusable across hospitals."
        title="Item Categories"
      />

      {editingCategory ? (
        <Panel className="p-4">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-normal text-ds-text">Edit Category</h2>
            <p className="text-sm text-ds-muted">Update category details and status.</p>
          </div>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <CategoryFormFields form={form} />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button onClick={cancelEditingCategory} type="button" variant="outline">
                Cancel
              </Button>
              <SubmitButton isPending={saveCategoryMutation.isPending} label="Update Category" />
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px_180px_130px_auto]">
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
            <option value="createdAt">Created date</option>
            <option value="categoryName">Category name</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void categoriesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[24%] px-4 py-2.5">Category Name</th>
                <th className="w-[11%] px-4 py-2.5">Status</th>
                <th className="w-[14%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[18%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((category) => (
                  <tr className="hover:bg-ds-subtle" key={category.id}>
                    <td className="px-4 py-3 font-medium text-ds-text">{category.categoryName}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={category.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggleButton
                        isActive={category.isActive}
                        isPending={toggleCategoryStatusMutation.isPending}
                        onToggle={() => toggleCategoryStatus(category)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(category.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(category.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => startEditingCategory(category)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
                          disabled={deleteCategoryMutation.isPending}
                          onClick={() => deleteCategory(category)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={6}
                  error={categoriesQuery.error}
                  isError={categoriesQuery.isError}
                  isLoading={categoriesQuery.isLoading}
                  label="item categories"
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

export function ItemCategoryCreatePageClient() {
  const form = useForm<ItemCategoryFormValues>({
    defaultValues: {
      categoryName: '',
      isActive: true,
    },
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createCategoryMutation = useMutation({
    mutationFn: (body: ItemCategoryInput) => organizationApi.createItemCategory(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarCategoryError) {
        form.setError('categoryName', { message });
      }

      showToast({
        description: message,
        title: 'Category was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-categories', { name: response.data.categoryName });
      invalidateItemCategoryQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.categoryName}` },
        title: 'Category created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = categorySchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createCategoryMutation.mutate({
      categoryName: parsed.data.categoryName,
      isActive: parsed.data.isActive,
    });
  });

  return (
    <FormShell
      backHref="/masters/item-categories"
      icon={Tags}
      subtitle="Create a global category reusable across hospitals."
      title="Create Item Category"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <CategoryFormFields form={form} />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!form.watch('categoryName')?.trim()}
            isPending={createCategoryMutation.isPending}
            label="Create Category"
          />
        </div>
      </form>
    </FormShell>
  );
}

// Card header tints: one of the concepts' tile colours, picked from the category id so a
// category always keeps the same colour. Dark mode keeps the portal's existing dark shades.
type ItemPanelTab = 'details' | 'mapping' | 'prices';

const itemTypeTagClasses: Record<ItemType, string> = {
  LIVE: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
  MRP: 'bg-ds-tile-items-bg text-ds-tile-items-fg',
  READYMADE: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
};
const itemTypeLabels: Record<ItemType, string> = {
  LIVE: 'Live',
  MRP: 'MRP',
  READYMADE: 'Readymade',
};
const itemTypeLongLabels: Record<ItemType, string> = {
  LIVE: 'Live (cooked to order)',
  MRP: 'MRP (packaged)',
  READYMADE: 'Readymade',
};
const rateTypeHints: Record<RateType, string> = {
  COUNTER: 'OPD & emergency counters',
  NORMAL: 'Walk-in guests',
  ROOM: 'In-room dining for patients',
  STAFF: 'Employees, with ID',
};
const itemPageSizes = [25, 50, 100];
const itemSortOptions = [
  { label: 'Recently added', value: 'createdAt:desc' },
  { label: 'Name A–Z', value: 'itemName:asc' },
  { label: 'Name Z–A', value: 'itemName:desc' },
  { label: 'Item code', value: 'itemCode:asc' },
  { label: 'Recently updated', value: 'updatedAt:desc' },
];
const rupees = new Intl.NumberFormat('en-IN', {
  currency: 'INR',
  maximumFractionDigits: 2,
  style: 'currency',
});

function todayValue(): string {
  return new Date().toLocaleDateString('en-CA');
}

function ItemTypeTag({ type }: Readonly<{ type: ItemType }>) {
  return (
    <span
      className={cn(
        'inline-flex rounded-[5px] px-[7px] py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]',
        itemTypeTagClasses[type],
      )}
    >
      {type}
    </span>
  );
}

/** Prices, details and where the item is used, for the open item. */
function ItemDetailTabs({ item }: Readonly<{ item: Item }>) {
  const { hasPermission } = useAuth();
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const [tab, setTab] = useState<ItemPanelTab>('prices');
  const scope = scopedHospitalId ?? 'all';
  const can = {
    kitchens: hasPermission('KITCHEN_ITEM_VIEW'),
    menus: hasPermission('RESTAURANT_MENU_VIEW'),
    prices: hasPermission('ITEM_PRICE_VIEW'),
    stores: hasPermission('STORE_ITEM_VIEW'),
  };
  const pricesQuery = useQuery({
    enabled: tab === 'prices' && can.prices,
    queryFn: async () =>
      (
        await organizationApi.listItemPrices({
          effectiveDate: todayValue(),
          hospitalId: scopedHospitalId,
          isActive: true,
          itemId: item.id,
          limit: 100,
        })
      ).data.items,
    queryKey: ['item-prices', 'item', item.id, scope],
  });
  const mappingQuery = useQuery({
    enabled: tab === 'mapping',
    queryFn: async () => {
      const query = { hospitalId: scopedHospitalId, itemId: item.id, limit: 100 };
      const [stores, kitchens, menus] = await Promise.all([
        can.stores
          ? organizationApi.listStoreItems(query).then((response) => response.data.items)
          : [],
        can.kitchens
          ? organizationApi.listKitchenItems(query).then((response) => response.data.items)
          : [],
        can.menus
          ? organizationApi.listRestaurantMenus(query).then((response) => response.data.items)
          : [],
      ]);

      return [
        ...stores.map((mapping) => ({
          active: mapping.isActive,
          hospital: mapping.store.hospital.hospitalName,
          href: locationHref('STORE', mapping.store.storeCode || mapping.store.storeName),
          id: mapping.id,
          kind: 'STORE' as const,
          name: mapping.store.storeName,
          status: mapping.isActive ? 'Mapped' : 'Inactive',
        })),
        ...kitchens.map((mapping) => ({
          active: mapping.isActive,
          hospital: mapping.kitchen.hospital.hospitalName,
          href: locationHref('KITCHEN', mapping.kitchen.kitchenCode || mapping.kitchen.kitchenName),
          id: mapping.id,
          kind: 'KITCHEN' as const,
          name: mapping.kitchen.kitchenName,
          status: mapping.isActive ? 'Mapped' : 'Inactive',
        })),
        ...menus.map((menu) => ({
          active: menu.isActive && menu.isAvailable,
          hospital: menu.restaurant.hospital.hospitalName,
          href: locationHref(
            'RESTAURANT',
            menu.restaurant.restaurantCode || menu.restaurant.restaurantName,
          ),
          id: menu.id,
          kind: 'MENU' as const,
          name: [
            menu.restaurant.restaurantName,
            menu.timeSlots.map((slot) => slot.slotName).join(', '),
          ]
            .filter(Boolean)
            .join(' · '),
          status: !menu.isActive ? 'Inactive' : menu.isAvailable ? 'On menu' : 'Unavailable',
        })),
      ];
    },
    queryKey: ['item-mappings', item.id, scope, can],
  });
  const prices = [...(pricesQuery.data ?? [])].sort(
    (left, right) =>
      rateTypeValues.indexOf(left.rateType) - rateTypeValues.indexOf(right.rateType) ||
      Number(Boolean(left.restaurantId)) - Number(Boolean(right.restaurantId)),
  );
  const tabs: Array<{ label: string; value: ItemPanelTab }> = [
    { label: 'Prices', value: 'prices' },
    { label: 'Details', value: 'details' },
    { label: 'Mapping', value: 'mapping' },
  ];
  const mappingTags = {
    KITCHEN: 'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg',
    MENU: 'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg',
    STORE: 'bg-ds-tile-stores-bg text-ds-tile-stores-fg',
  };

  return (
    <>
      <SavedViewTabs<ItemPanelTab>
        label="Item sections"
        onChange={setTab}
        value={tab}
        views={tabs}
      />

      {tab === 'prices' ? (
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          {!can.prices ? (
            <p className="text-[13px] text-ds-muted">Your role can't view item prices.</p>
          ) : pricesQuery.isLoading ? (
            <LoadingRows />
          ) : prices.length === 0 ? (
            <p className="text-[13px] text-ds-muted">No price is in effect today.</p>
          ) : (
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="border-b border-ds-divider text-left text-[11.5px] text-ds-muted">
                  <th className="pb-1.5 font-semibold">Rate type</th>
                  <th className="w-[76px] pb-1.5 text-right font-semibold">Price</th>
                  <th className="w-[50px] pb-1.5 text-right font-semibold">GST</th>
                  <th className="w-[92px] pb-1.5 text-right font-semibold">From</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((price) => (
                  <tr className="align-top" key={price.id}>
                    <td className="py-1.5 pr-2">
                      <span className="block font-bold text-ds-text">
                        {formatEnum(price.rateType)}
                      </span>
                      <span className="block truncate text-[11.5px] text-ds-muted">
                        {price.restaurant
                          ? `${price.restaurant.restaurantName} override`
                          : isAllLocations
                            ? price.hospital.hospitalName
                            : rateTypeHints[price.rateType]}
                        {price.isTaxInclusive ? ' · tax inclusive' : ''}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-extrabold tabular-nums text-ds-text">
                      {rupees.format(price.price)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ds-text-3">
                      {price.gstPercent !== null ? `${price.gstPercent}%` : '—'}
                    </td>
                    <td className="py-1.5 text-right text-xs tabular-nums text-ds-text-3">
                      {formatDateOnly(price.effectiveFrom)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {can.prices ? (
            <Button asChild className="h-[38px] text-[13px] text-ds-link" variant="outline">
              <Link href="/masters/item-prices">Edit prices</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {tab === 'details' ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 px-[18px] py-3.5 text-[13px]">
          {[
            ['Item code', item.itemCode],
            ['Category', item.category.categoryName],
            ['Food type', foodTypeFormLabels[item.type]],
            ['Item type', itemTypeLongLabels[item.itemType]],
            [
              'Preparation',
              item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : '—',
            ],
            ['HSN code', item.hsnCode || '—'],
            ['Status', item.isActive ? 'Active' : 'Inactive'],
            ['Updated', formatDate(item.updatedAt)],
          ].map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-ds-muted">{label}</dt>
              <dd className="truncate font-bold text-ds-text">{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}

      {tab === 'mapping' ? (
        <div className="flex flex-col gap-2 px-[18px] py-3.5">
          {mappingQuery.isLoading ? (
            <LoadingRows />
          ) : (mappingQuery.data ?? []).length === 0 ? (
            <p className="text-[13px] text-ds-muted">
              Not mapped to any store, kitchen or restaurant menu
              {isAllLocations ? '' : ' at this location'} yet.
            </p>
          ) : (
            (mappingQuery.data ?? []).map((mapping) => (
              <div
                className="flex min-h-10 items-center gap-2.5 rounded-control border border-ds-border px-2.5 py-1.5"
                key={`${mapping.kind}-${mapping.id}`}
              >
                <span
                  className={cn(
                    'shrink-0 rounded-[5px] px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.04em]',
                    mappingTags[mapping.kind],
                  )}
                >
                  {mapping.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <RecordLink
                    className="block truncate text-[13px] font-bold text-ds-text"
                    href={mapping.href}
                  >
                    {mapping.name}
                  </RecordLink>
                  {isAllLocations ? (
                    <span className="block truncate text-[11.5px] text-ds-muted">
                      {mapping.hospital}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    mapping.active ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                  )}
                >
                  {mapping.status}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  );
}

export function ItemsPageClient() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const { scopedHospitalId } = useLocationContext();
  // Search, filters, sort, page size, page and the open item all live in the URL.
  const [page, setPage] = useUrlNumberParam('page');
  const [rows, setPageSize] = useUrlNumberParam('rows', 25);
  const pageSize = itemPageSizes.includes(rows) ? rows : 25;
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [categoryFilter, setCategoryFilter] = useUrlParam('category');
  const [foodTypeFilter, setFoodTypeFilter] = useUrlParam<FoodTypeFilter>(
    'food',
    '',
    foodTypeValues,
  );
  const [itemTypeFilter, setItemTypeFilter] = useUrlParam<ItemTypeFilter>(
    'type',
    '',
    itemTypeValues,
  );
  const [sort, setSort] = useUrlParam(
    'sort',
    'createdAt:desc',
    itemSortOptions.map((option) => option.value),
  );
  const [sortBy = 'createdAt', sortDirection] = sort.split(':');
  const sortOrder: SortOrder = sortDirection === 'asc' ? 'asc' : 'desc';
  const hrefWith = useHrefWith();
  const [isEditing, setIsEditing] = useState(false);
  // The open item lives in the URL (?id=), so links from the palette land on it.
  const selectedItemId = searchParams.get('id');
  const categoryOptionsQuery = useItemCategoryOptions();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<ItemFormValues>({
    defaultValues: emptyItemFormValues(),
  });

  const itemsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listItems({
        categoryId: categoryFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        itemType: itemTypeFilter || undefined,
        limit: pageSize,
        page,
        search,
        sortBy,
        sortOrder,
        type: foodTypeFilter || undefined,
      });

      return response.data;
    },
    queryKey: [
      'items',
      {
        activeFilter,
        categoryFilter,
        foodTypeFilter,
        itemTypeFilter,
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
      },
    ],
  });

  // Today's base Normal price per item, for the price column.
  // ponytail: first 100 prices; a per-item price field on the list if catalogues outgrow it.
  const normalPricesQuery = useQuery({
    enabled: hasPermission('ITEM_PRICE_VIEW'),
    queryFn: async () =>
      (
        await organizationApi.listItemPrices({
          effectiveDate: todayValue(),
          hospitalId: scopedHospitalId,
          isActive: true,
          limit: 100,
          rateType: 'NORMAL',
        })
      ).data.items,
    queryKey: ['item-prices', 'normal', scopedHospitalId ?? 'all'],
  });
  const normalPrices = new Map<string, number[]>();

  (normalPricesQuery.data ?? [])
    .filter((price) => !price.restaurantId)
    .forEach((price) =>
      normalPrices.set(price.itemId, [...(normalPrices.get(price.itemId) ?? []), price.price]),
    );

  const items = itemsQuery.data?.items ?? [];
  const meta = itemsQuery.data?.meta ?? { limit: pageSize, page, total: 0, totalPages: 1 };
  const listedItem = items.find((item) => item.id === selectedItemId);
  const linkedItemQuery = useQuery({
    enabled: Boolean(selectedItemId) && !listedItem && !itemsQuery.isLoading,
    queryFn: async () => (await organizationApi.getItem(selectedItemId ?? '')).data,
    queryKey: ['items', 'detail', selectedItemId],
    retry: false,
  });
  const selectedItem = listedItem ?? linkedItemQuery.data;
  useBreadcrumbLabel(
    selectedItemId,
    selectedItem?.itemName ?? (linkedItemQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    setIsEditing(false);
  }, [selectedItemId]);

  // On narrow screens the panel sits under the list; bring it into view when opened.
  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const panel = document.getElementById('item-detail-panel');

    if (panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedItem]);

  const saveItemMutation = useMutation({
    mutationFn: (body: ItemInput) =>
      selectedItem
        ? organizationApi.updateItem(selectedItem.id, body)
        : organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: 'Item was not updated',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemQueries(queryClient);
      showToast({ title: 'Item updated', variant: 'success' });
      setIsEditing(false);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteItem(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemQueries(queryClient);
      setUrlParams({ id: null });
      showToast({
        title: 'Item deleted',
        variant: 'success',
      });
    },
  });

  const toggleItemStatusMutation = useMutation({
    mutationFn: ({ isActive, item }: { isActive: boolean; item: Item }) =>
      organizationApi.updateItem(item.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Item activated' : 'Item marked inactive',
        variant: 'success',
      });
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveItemMutation.mutate({
      categoryId: parsed.data.categoryId,
      hsnCode: optionalValue(parsed.data.hsnCode),
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      itemType: parsed.data.itemType,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes,
      type: parsed.data.type,
    });
  });

  function closeItem() {
    const id = selectedItemId;
    setUrlParams({ id: null });
    window.requestAnimationFrame(() => document.getElementById(`item-open-${id}`)?.focus());
  }

  function startEditing(item: Item) {
    form.reset(itemToFormValues(item));
    setIsEditing(true);
  }

  function deleteItem(item: Item) {
    if (window.confirm(`Delete ${item.itemName}?`)) {
      deleteItemMutation.mutate(item.id);
    }
  }

  function toggleItemStatus(item: Item) {
    const nextIsActive = !item.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this item inactive will prevent it from being used in new operations. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleItemStatusMutation.mutate({ isActive: nextIsActive, item });
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setCategoryFilter('');
    setFoodTypeFilter('');
    setItemTypeFilter('');
    setPage(1);
  }

  const hasFilters = Boolean(
    search || activeFilter || categoryFilter || foodTypeFilter || itemTypeFilter,
  );
  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.page * meta.limit, meta.total);

  function priceText(itemId: string): { text: string; title?: string } {
    const prices = [...new Set(normalPrices.get(itemId) ?? [])].sort((left, right) => left - right);
    const [lowest] = prices;

    if (lowest === undefined) {
      return { text: '—' };
    }

    return prices.length === 1
      ? { text: rupees.format(lowest) }
      : { text: `${rupees.format(lowest)}+`, title: 'Varies by location' };
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-ds-text">Items</h1>
          <p className="text-[13.5px] text-ds-muted">
            One catalogue for every store, kitchen and restaurant. Prices are set per rate type.
          </p>
        </div>
        <IfCanOpen href="/masters/items/new">
          <Button asChild>
            <Link href="/masters/items/new">
              <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
              New item
            </Link>
          </Button>
        </IfCanOpen>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Panel
          aria-label="Item list"
          className="min-w-0 flex-[1_1_560px] overflow-hidden"
          role="region"
        >
          <FilterBar>
            <FilterSearch
              label="Search items"
              onChange={(value) => changeFilter(() => setSearch(value))}
              placeholder="Search name or code"
              value={searchInput}
            />
            <SegmentedControl<FoodTypeFilter>
              label="Food type"
              onChange={(value) => changeFilter(() => setFoodTypeFilter(value))}
              options={[
                { label: 'All', value: '' },
                { label: 'Veg', value: 'VEG' },
                { label: 'Non-veg', value: 'NON_VEG' },
                { label: 'Egg', value: 'EGGETARIAN' },
              ]}
              value={foodTypeFilter}
            />
            <FilterSelect
              label="Type"
              onChange={(value) => changeFilter(() => setItemTypeFilter(value as ItemTypeFilter))}
              value={itemTypeFilter}
            >
              <option value="">All</option>
              {itemTypeValues.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemTypeLabels[itemType]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Category"
              onChange={(value) => changeFilter(() => setCategoryFilter(value))}
              value={categoryFilter}
            >
              <option value="">All</option>
              {(categoryOptionsQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.categoryName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Status"
              onChange={(value) => changeFilter(() => setActiveFilter(value as ActiveFilter))}
              value={activeFilter}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </FilterSelect>
            <FilterSelect
              label="Sort"
              onChange={(value) => changeFilter(() => setSort(value))}
              value={sort}
            >
              {itemSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] table-fixed text-[13px]">
              <thead className="border-b border-ds-divider bg-ds-subtle text-left text-xs text-ds-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Item</th>
                  <th className="w-[130px] px-3 py-2.5 font-semibold">Category</th>
                  <th className="w-[108px] px-3 py-2.5 font-semibold">Type</th>
                  <th className="w-[84px] px-3 py-2.5 text-right font-semibold">Normal</th>
                  <th className="w-[118px] px-3 py-2.5 pr-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {itemsQuery.isLoading ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <tr className="border-b border-ds-divider" key={`item-skeleton-${index}`}>
                      <td className="px-4 py-3" colSpan={5}>
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : itemsQuery.isError ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm font-medium text-ds-status-bad-fg"
                      colSpan={5}
                    >
                      {getApiErrorMessage(itemsQuery.error)}
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td className="p-4" colSpan={5}>
                      <EmptyState
                        action={
                          hasFilters ? (
                            <Button onClick={clearFilters} type="button" variant="outline">
                              Clear filters
                            </Button>
                          ) : undefined
                        }
                        description={
                          hasFilters
                            ? 'Try another name or clear the food-type filter.'
                            : 'Create the first item to start the catalogue.'
                        }
                        title={hasFilters ? 'No items match' : 'No items yet'}
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isSelected = item.id === selectedItem?.id;
                    const price = priceText(item.id);

                    return (
                      <tr
                        className={cn(
                          'cursor-pointer border-b border-ds-divider transition',
                          isSelected ? 'bg-ds-selected' : 'hover:bg-ds-subtle',
                        )}
                        key={item.id}
                        onClick={openRowLink}
                      >
                        <td className="px-4 py-1.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <FoodTypeMarker type={item.type} />
                            <span className="flex min-w-0 flex-col">
                              <Link
                                aria-current={isSelected ? 'true' : undefined}
                                className={cn(
                                  'truncate rounded-sm text-left text-[13.5px] font-bold hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ds-primary',
                                  isSelected ? 'text-ds-link' : 'text-ds-text',
                                )}
                                data-row-link=""
                                href={hrefWith({ id: item.id })}
                                id={`item-open-${item.id}`}
                                prefetch={false}
                                scroll={false}
                              >
                                {item.itemName}
                              </Link>
                              <span className="truncate text-[11.5px] tabular-nums text-ds-muted">
                                {item.itemCode}
                                {item.hsnCode ? ` · HSN ${item.hsnCode}` : ''}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="truncate px-3 py-1.5 text-[12.5px] text-ds-text-2">
                          {item.category.categoryName}
                        </td>
                        <td className="px-3 py-1.5">
                          <ItemTypeTag type={item.itemType} />
                        </td>
                        <td
                          className="px-3 py-1.5 text-right font-bold tabular-nums text-ds-text"
                          title={price.title}
                        >
                          {price.text}
                        </td>
                        <td
                          className="px-3 py-1.5 pr-4"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <span className="flex items-center gap-2">
                            <Toggle
                              ariaLabel={`${item.itemName} active`}
                              checked={item.isActive}
                              disabled={toggleItemStatusMutation.isPending}
                              onChange={() => toggleItemStatus(item)}
                            />
                            <span
                              className={cn(
                                'text-xs font-bold',
                                item.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                              )}
                            >
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-ds-muted">
            <span>
              Showing{' '}
              <strong className="font-bold text-ds-text">
                {firstRow}–{lastRow}
              </strong>{' '}
              of {plural(meta.total, 'item')}
            </span>
            <span className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5">
                Rows
                <select
                  className="h-[30px] rounded-[7px] border border-ds-border bg-ds-surface px-1.5 text-[12.5px] font-bold text-ds-text"
                  onChange={(event) => changeFilter(() => setPageSize(Number(event.target.value)))}
                  value={pageSize}
                >
                  {itemPageSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                aria-label="Previous page"
                className="h-[30px] w-[30px]"
                disabled={meta.page <= 1}
                onClick={() => setPage(meta.page - 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
              <Button
                aria-label="Next page"
                className="h-[30px] w-[30px]"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage(meta.page + 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </span>
          </div>
        </Panel>

        {selectedItemId ? (
          selectedItem ? (
            <DetailPanel
              className="min-w-[300px] flex-[0_1_400px]"
              footer={
                isEditing ? undefined : (
                  <>
                    <Button
                      className="flex-1"
                      onClick={() => startEditing(selectedItem)}
                      type="button"
                      variant="outline"
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      Edit details
                    </Button>
                    <Button
                      aria-label={`Delete ${selectedItem.itemName}`}
                      className="text-ds-status-bad-fg hover:text-ds-status-bad-fg"
                      disabled={deleteItemMutation.isPending}
                      onClick={() => deleteItem(selectedItem)}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )
              }
              id="item-detail-panel"
              label={`${selectedItem.itemName} details`}
              meta={`${selectedItem.itemCode} · ${selectedItem.category.categoryName} · ${itemTypeLabels[selectedItem.itemType]}`}
              onClose={closeItem}
              status={selectedItem.isActive ? null : <Badge>Inactive</Badge>}
              title={
                <span className="flex items-center gap-2">
                  <FoodTypeMarker type={selectedItem.type} />
                  {selectedItem.itemName}
                </span>
              }
            >
              {isEditing ? (
                <form
                  className="grid gap-4 px-[18px] py-4"
                  onSubmit={(event) => {
                    void handleSubmit(event);
                  }}
                >
                  <ItemFormFields categories={categoryOptionsQuery.data} form={form} />
                  {categoryOptionsQuery.isError ? (
                    <p className="text-sm font-medium text-ds-status-bad-fg">
                      {getApiErrorMessage(categoryOptionsQuery.error)}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 border-t border-ds-divider pt-4">
                    <Button onClick={() => setIsEditing(false)} type="button" variant="outline">
                      Cancel
                    </Button>
                    <SubmitButton isPending={saveItemMutation.isPending} label="Save item" />
                  </div>
                </form>
              ) : (
                <ItemDetailTabs item={selectedItem} key={selectedItem.id} />
              )}
            </DetailPanel>
          ) : (
            <Panel className="min-w-[300px] flex-[0_1_400px] p-4">
              {linkedItemQuery.isError ? (
                <EmptyState
                  action={
                    <Button
                      onClick={() => setUrlParams({ id: null })}
                      type="button"
                      variant="outline"
                    >
                      Close
                    </Button>
                  }
                  description="It may have been deleted."
                  title="Item not found"
                />
              ) : (
                <LoadingRows />
              )}
            </Panel>
          )
        ) : null}
      </div>
    </section>
  );
}

export function ItemCreatePageClient() {
  const form = useForm<ItemFormValues>({
    defaultValues: emptyItemFormValues(),
  });
  const categoryOptionsQuery = useItemCategoryOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createItemMutation = useMutation({
    mutationFn: (body: ItemInput) => organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: 'Item was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/items', { id: response.data.id });
      invalidateItemQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.itemName}` },
        description: `Generated item code: ${response.data.itemCode}`,
        title: 'Item created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const formValues = form.watch();
  const canSubmit =
    Boolean(formValues.categoryId) &&
    Boolean(formValues.itemName?.trim()) &&
    Boolean(formValues.itemType) &&
    Boolean(formValues.type) &&
    !categoryOptionsQuery.isLoading &&
    Boolean(categoryOptionsQuery.data?.length);

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createItemMutation.mutate({
      categoryId: parsed.data.categoryId,
      hsnCode: optionalValue(parsed.data.hsnCode),
      isActive: parsed.data.isActive,
      itemName: parsed.data.itemName,
      itemType: parsed.data.itemType,
      preparationTimeMinutes: parsed.data.preparationTimeMinutes,
      type: parsed.data.type,
    });
  });

  return (
    <FormShell
      backHref="/masters/items"
      icon={PackageOpen}
      subtitle="Create a global item for future menu, inventory, and billing workflows."
      title="Create Item"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <ItemFormFields categories={categoryOptionsQuery.data} form={form} />
        {categoryOptionsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(categoryOptionsQuery.error)}
          </p>
        ) : null}
        {!categoryOptionsQuery.isLoading && !categoryOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            Create an item category before creating an item.
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createItemMutation.isPending}
            label="Create Item"
          />
        </div>
      </form>
    </FormShell>
  );
}

export function ItemPricesPageClient() {
  const { isLoadingLocations, scopedHospitalId } = useLocationContext();
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [rateTypeFilter, setRateTypeFilter] = useState<RateTypeFilter>('');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
  }, [scopedHospitalId]);

  useOnScopeChange(scopedHospitalId, isLoadingLocations, () => {
    setRestaurantFilter('');
    setPage(1);
  });

  const itemPricesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listItemPrices({
        effectiveDate: optionalValue(effectiveDate),
        hospitalId: hospitalFilter || undefined,
        isActive: activeFilterToBoolean(activeFilter),
        itemType: itemTypeFilter || undefined,
        limit: listLimit,
        page,
        rateType: rateTypeFilter || undefined,
        restaurantId: restaurantFilter || undefined,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: [
      'item-prices',
      {
        activeFilter,
        effectiveDate,
        hospitalFilter,
        itemTypeFilter,
        page,
        rateTypeFilter,
        restaurantFilter,
        search,
        sortBy,
        sortOrder,
      },
    ],
  });

  const deleteItemPriceMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteItemPrice(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item price was not deleted',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateItemPriceQueries(queryClient);
      showToast({
        title: 'Item price deleted',
        variant: 'success',
      });
    },
  });

  const toggleItemPriceStatusMutation = useMutation({
    mutationFn: ({ isActive, price }: { isActive: boolean; price: ItemPrice }) =>
      organizationApi.updateItemPrice(price.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Item price status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateItemPriceQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Item price activated' : 'Item price marked inactive',
        variant: 'success',
      });
    },
  });

  const items = itemPricesQuery.data?.items ?? [];
  const meta = itemPricesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

  function deleteItemPrice(price: ItemPrice) {
    const shouldDelete = window.confirm(
      `Delete ${price.item.itemName} ${formatEnum(price.rateType)} price?`,
    );

    if (shouldDelete) {
      deleteItemPriceMutation.mutate(price.id);
    }
  }

  function toggleItemPriceStatus(price: ItemPrice) {
    const nextIsActive = !price.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this price inactive will prevent it from being used by future restaurant operations and POS. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleItemPriceStatusMutation.mutate({ isActive: nextIsActive, price });
  }

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <IfCanOpen href="/masters/item-prices/new">
            <Button asChild>
              <Link href="/masters/item-prices/new">
                <Plus className="h-4 w-4" />
                Create
              </Link>
            </Button>
          </IfCanOpen>
        }
        eyebrow="Master Data"
        icon={IndianRupee}
        subtitle="Define sale pricing by location, restaurant, item, and rate type."
        title="Item Prices"
      />

      <Panel>
        <div className="grid gap-3 border-b border-ds-divider p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:[&>*:first-child]:col-span-2 [&>button]:justify-self-start">
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <Select
            disabled={Boolean(scopedHospitalId)}
            onChange={(event) => {
              setHospitalFilter(event.target.value);
              setRestaurantFilter('');
              setPage(1);
            }}
            value={hospitalFilter}
          >
            <option value="">All locations</option>
            {hospitalsQuery.data?.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {formatLocationOption(hospital)}
              </option>
            ))}
          </Select>
          <Select
            disabled={!hospitalFilter}
            onChange={(event) => {
              setRestaurantFilter(event.target.value);
              setPage(1);
            }}
            value={restaurantFilter}
          >
            <option value="">All restaurants</option>
            {restaurantsQuery.data?.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.restaurantName}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setItemTypeFilter(event.target.value as ItemTypeFilter);
              setPage(1);
            }}
            value={itemTypeFilter}
          >
            <option value="">All item types</option>
            {itemTypeValues.map((itemType) => (
              <option key={itemType} value={itemType}>
                {formatEnum(itemType)}
              </option>
            ))}
          </Select>
          <Select
            onChange={(event) => {
              setRateTypeFilter(event.target.value as RateTypeFilter);
              setPage(1);
            }}
            value={rateTypeFilter}
          >
            <option value="">All rate types</option>
            {rateTypeValues.map((rateType) => (
              <option key={rateType} value={rateType}>
                {formatEnum(rateType)}
              </option>
            ))}
          </Select>
          <ActiveFilterSelect
            onChange={(value) => {
              setActiveFilter(value);
              setPage(1);
            }}
            value={activeFilter}
          />
          <Input
            onChange={(event) => {
              setEffectiveDate(event.target.value);
              setPage(1);
            }}
            type="date"
            value={effectiveDate}
          />
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button onClick={() => void itemPricesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="updatedAt">Updated date</option>
            <option value="price">Price</option>
            <option value="rateType">Rate type</option>
            <option value="effectiveFrom">Effective from</option>
            <option value="effectiveTo">Effective to</option>
            <option value="isActive">Status</option>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-ds-divider text-sm">
            <thead className="bg-ds-subtle text-left text-xs font-semibold uppercase tracking-normal text-ds-muted">
              <tr>
                <th className="w-[17%] px-4 py-2.5">Location</th>
                <th className="w-[14%] px-4 py-2.5">Restaurant</th>
                <th className="w-[16%] px-4 py-2.5">Item</th>
                <th className="w-[11%] px-4 py-2.5">Item Type</th>
                <th className="w-[10%] px-4 py-2.5">Rate Type</th>
                <th className="w-[10%] px-4 py-2.5">Price</th>
                <th className="w-[10%] px-4 py-2.5">Tax Inclusive</th>
                <th className="w-[9%] px-4 py-2.5">GST %</th>
                <th className="w-[12%] px-4 py-2.5">Effective From</th>
                <th className="w-[12%] px-4 py-2.5">Effective To</th>
                <th className="w-[9%] px-4 py-2.5">Status</th>
                <th className="w-[13%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[15%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[16%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider bg-white">
              {items.length > 0 ? (
                items.map((price) => (
                  <tr className="hover:bg-ds-subtle" key={price.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ds-text">
                        {price.hospital.displayName ?? price.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-ds-muted">{price.hospital.hospitalCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {price.restaurant ? (
                        <RecordLink
                          href={locationHref(
                            'RESTAURANT',
                            price.restaurant.restaurantCode || price.restaurant.restaurantName,
                          )}
                        >
                          {price.restaurant.restaurantName}
                        </RecordLink>
                      ) : (
                        'All restaurants'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RecordLink
                        className="block font-medium text-ds-text"
                        href={recordHref('/masters/items', { id: price.item.id })}
                      >
                        {price.item.itemName}
                      </RecordLink>
                      <p className="text-xs text-ds-muted">{price.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">{formatEnum(price.item.itemType)}</td>
                    <td className="px-4 py-3">
                      <Badge className="border-ds-status-info-fg/25 bg-ds-status-info-bg text-ds-status-info-fg">
                        {formatEnum(price.rateType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-ds-text">
                      {formatCurrency(price.price)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={price.isTaxInclusive ? 'success' : 'neutral'}>
                        {price.isTaxInclusive ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ds-text-3">
                      {price.gstPercent === null ? '-' : `${price.gstPercent}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(price.effectiveFrom)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDateOnly(price.effectiveTo)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={price.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggleButton
                        isActive={price.isActive}
                        isPending={toggleItemPriceStatusMutation.isPending}
                        onToggle={() => toggleItemPriceStatus(price)}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(price.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ds-text-3">
                      {formatDate(price.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <IfCanOpen href={`/masters/item-prices/${price.id}/edit`}>
                          <Button asChild size="sm" type="button" variant="outline">
                            <Link href={`/masters/item-prices/${price.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </Button>
                        </IfCanOpen>
                        <Button
                          className="border-ds-status-bad-fg/25 text-ds-status-bad-fg hover:bg-ds-status-bad-bg"
                          disabled={deleteItemPriceMutation.isPending}
                          onClick={() => deleteItemPrice(price)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={15}
                  error={itemPricesQuery.error}
                  isError={itemPricesQuery.isError}
                  isLoading={itemPricesQuery.isLoading}
                  label="item prices"
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

export function ItemPriceCreatePageClient() {
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const form = useForm<ItemPriceFormValues>({
    defaultValues: emptyItemPriceFormValues(),
  });
  const [itemSearch, setItemSearch] = useState('');
  const selectedHospitalId = form.watch('hospitalId');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId);
  const itemOptionsQuery = useItemOptions(undefined, itemSearch);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
      form.setValue('restaurantId', '', { shouldValidate: true });
    }
  }, [form, scopedHospitalId]);

  const createItemPriceMutation = useMutation({
    mutationFn: (body: ItemPriceInput) => organizationApi.createItemPrice(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === overlappingItemPriceError) {
        form.setError('effectiveFrom', { message });
      }

      showToast({
        description: message,
        title: 'Item price was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-prices', { name: response.data.item.itemName });
      invalidateItemPriceQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.item.itemName}` },
        title: 'Item price created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const formValues = form.watch();
  const canSubmit =
    Boolean(formValues.hospitalId) &&
    Boolean(formValues.itemId) &&
    Boolean(formValues.rateType) &&
    Number(formValues.price) > 0 &&
    (!formValues.isTaxInclusive || Boolean(formValues.gstPercent)) &&
    Boolean(formValues.effectiveFrom);

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemPriceSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createItemPriceMutation.mutate(toItemPricePayload(parsed.data));
  });

  return (
    <FormShell
      backHref="/masters/item-prices"
      icon={IndianRupee}
      subtitle="Create a sale price for a location, optional restaurant, item, and rate type."
      title="Create Item Price"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <ItemPriceFormFields
          form={form}
          hospitals={hospitalsQuery.data}
          isLocationLocked={isLocationSelectorLocked}
          isItemsLoading={itemOptionsQuery.isLoading}
          itemSearch={itemSearch}
          items={getItemPriceItemOptions(itemOptionsQuery.data)}
          onItemSearch={setItemSearch}
          restaurants={restaurantsQuery.data}
        />
        {hospitalsQuery.isError || restaurantsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(hospitalsQuery.error ?? restaurantsQuery.error)}
          </p>
        ) : null}
        {itemOptionsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            Unable to load active items. Please try searching again or refresh the page.
          </p>
        ) : null}
        {!formValues.itemId && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            {itemSearch
              ? 'No active items match your search.'
              : 'Create an active item before creating item prices.'}
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createItemPriceMutation.isPending}
            label="Create Item Price"
          />
        </div>
      </form>
    </FormShell>
  );
}

export function ItemPriceEditPageClient({ itemPriceId }: Readonly<{ itemPriceId: string }>) {
  const { isLocationSelectorLocked } = useLocationContext();
  const form = useForm<ItemPriceFormValues>({
    defaultValues: emptyItemPriceFormValues(),
  });
  const [itemSearch, setItemSearch] = useState('');
  const selectedHospitalId = form.watch('hospitalId');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(selectedHospitalId);
  const itemOptionsQuery = useItemOptions(undefined, itemSearch);
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const itemPriceQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.getItemPrice(itemPriceId);

      return response.data;
    },
    queryKey: ['item-prices', itemPriceId],
  });
  useBreadcrumbLabel(
    itemPriceId,
    itemPriceQuery.data?.item.itemName ?? (itemPriceQuery.isError ? 'Not found' : undefined),
  );

  useEffect(() => {
    if (itemPriceQuery.data) {
      form.reset(itemPriceToFormValues(itemPriceQuery.data));
      setItemSearch(formatItemPriceItemLabel(itemPriceQuery.data.item));
    }
  }, [form, itemPriceQuery.data]);

  const updateItemPriceMutation = useMutation({
    mutationFn: (body: ItemPriceInput) => organizationApi.updateItemPrice(itemPriceId, body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === overlappingItemPriceError) {
        form.setError('effectiveFrom', { message });
      }

      showToast({
        description: message,
        title: 'Item price was not updated',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/item-prices', { name: response.data.item.itemName });
      invalidateItemPriceQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.item.itemName}` },
        title: 'Item price updated',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = itemPriceSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    updateItemPriceMutation.mutate(toItemPricePayload(parsed.data));
  });

  if (itemPriceQuery.isLoading) {
    return (
      <FormShell
        backHref="/masters/item-prices"
        icon={IndianRupee}
        subtitle="Loading sale price details."
        title="Edit Item Price"
      >
        <div className="grid gap-4">
          {skeletonRows.map((row) => (
            <Skeleton className="h-10 w-full" key={row} />
          ))}
        </div>
      </FormShell>
    );
  }

  if (itemPriceQuery.isError) {
    return (
      <FormShell
        backHref="/masters/item-prices"
        icon={IndianRupee}
        subtitle="Unable to load sale price details."
        title="Edit Item Price"
      >
        <div className="rounded-md border border-ds-status-bad-fg/25 bg-ds-status-bad-bg p-4 text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(itemPriceQuery.error)}
        </div>
      </FormShell>
    );
  }

  return (
    <FormShell
      backHref="/masters/item-prices"
      icon={IndianRupee}
      subtitle="Update sale pricing and effective date range."
      title="Edit Item Price"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <ItemPriceFormFields
          form={form}
          hospitals={hospitalsQuery.data}
          isLocationLocked={isLocationSelectorLocked}
          isItemsLoading={itemOptionsQuery.isLoading}
          itemSearch={itemSearch}
          items={getItemPriceItemOptions(itemOptionsQuery.data, itemPriceQuery.data?.item)}
          onItemSearch={setItemSearch}
          restaurants={restaurantsQuery.data}
        />
        {hospitalsQuery.isError || restaurantsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            {getApiErrorMessage(hospitalsQuery.error ?? restaurantsQuery.error)}
          </p>
        ) : null}
        {itemOptionsQuery.isError ? (
          <p className="text-sm font-medium text-ds-status-bad-fg">
            Unable to load active items. Please try searching again or refresh the page.
          </p>
        ) : null}
        {!form.watch('itemId') && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-ds-status-pending-fg/25 bg-ds-status-pending-bg px-4 py-3 text-sm font-medium text-ds-status-pending-fg">
            {itemSearch
              ? 'No active items match your search.'
              : 'Create an active item before creating item prices.'}
          </div>
        ) : null}
        <div className="flex justify-end">
          <SubmitButton isPending={updateItemPriceMutation.isPending} label="Update Item Price" />
        </div>
      </form>
    </FormShell>
  );
}

type EmployeeDialog =
  { mode: 'create' } | { employee: Employee; mode: 'edit' } | { employee: Employee; mode: 'view' };

export function EmployeesPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  const [searchInput, setSearch] = useUrlParam('q');
  // Queries wait for a pause in typing; the box and the URL update at once.
  const search = useDebouncedValue(searchInput);
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [discountFilter, setDiscountFilter] = useState<DiscountFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  // One pop-up for create, view and edit.
  const [dialog, setDialog] = useState<EmployeeDialog | null>(null);
  const editingEmployee = dialog?.mode === 'edit' ? dialog.employee : null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const form = useForm<EmployeeFormValues>({
    defaultValues: emptyEmployeeFormValues(),
  });

  const employeesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listEmployees({
        eligibleForDiscount: discountFilterToBoolean(discountFilter),
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: [
      'employees',
      {
        activeFilter,
        discountFilter,
        page,
        search,
        sortBy,
        sortOrder,
      },
    ],
  });

  const saveEmployeeMutation = useMutation({
    mutationFn: (body: EmployeeInput) =>
      editingEmployee
        ? organizationApi.updateEmployee(editingEmployee.id, body)
        : organizationApi.createEmployee(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: editingEmployee ? 'Employee was not updated' : 'Employee was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      invalidateEmployeeQueries(queryClient);
      showToast({
        title: editingEmployee ? 'Employee updated' : 'Employee created',
        variant: 'success',
      });
      closeDialog();
    },
  });

  const employees = employeesQuery.data?.items ?? [];
  const meta = employeesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  const formValues = form.watch();
  const canSave =
    Boolean(formValues.employeeCode?.trim()) && Boolean(formValues.employeeName?.trim());

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = employeeSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    saveEmployeeMutation.mutate({
      department: optionalValue(parsed.data.department),
      designation: optionalValue(parsed.data.designation),
      eligibleForDiscount: parsed.data.eligibleForDiscount,
      employeeCode: parsed.data.employeeCode,
      employeeName: parsed.data.employeeName,
      isActive: parsed.data.isActive,
      mobile: optionalValue(parsed.data.mobile),
    });
  });

  function openCreate() {
    form.reset(emptyEmployeeFormValues());
    setDialog({ mode: 'create' });
  }

  function openEdit(employee: Employee) {
    form.reset(employeeToFormValues(employee));
    setDialog({ employee, mode: 'edit' });
  }

  function closeDialog() {
    setDialog(null);
    form.reset(emptyEmployeeFormValues());
  }

  const dialogTitle =
    dialog?.mode === 'create'
      ? 'Create employee'
      : dialog?.mode === 'edit'
        ? 'Edit employee'
        : 'Employee details';

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button onClick={openCreate} type="button">
            <Plus className="h-4 w-4" />
            Create
          </Button>
        }
        eyebrow="Master Data"
        icon={UsersRound}
        subtitle="Maintain employee records for future staff discount validation."
        title="Employees"
      />

      <Panel className="overflow-hidden">
        <div className="grid gap-3 border-b border-ds-divider p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:[&>*:first-child]:col-span-2 [&>button]:justify-self-start">
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
              setDiscountFilter(event.target.value as DiscountFilter);
              setPage(1);
            }}
            value={discountFilter}
          >
            <option value="">All discount eligibility</option>
            <option value="eligible">Eligible</option>
            <option value="notEligible">Not eligible</option>
          </Select>
          <Select
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(1);
            }}
            value={sortBy}
          >
            <option value="createdAt">Created date</option>
            <option value="employeeName">Employee name</option>
            <option value="employeeCode">Employee code</option>
            <option value="department">Department</option>
            <option value="designation">Designation</option>
            <option value="mobile">Mobile</option>
            <option value="eligibleForDiscount">Discount eligible</option>
            <option value="updatedAt">Updated date</option>
            <option value="isActive">Status</option>
          </Select>
          <SortOrderSelect
            onChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            value={sortOrder}
          />
          <Button
            aria-label="Refresh employees"
            onClick={() => void employeesQuery.refetch()}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          {/* The created date/time sits on two lines so the table stays narrow; the updated
              time is in the View pop-up. */}
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-ds-subtle text-left">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-2.5 py-2.5">Department</th>
                <th className="px-2.5 py-2.5">Designation</th>
                <th className="px-2.5 py-2.5">Mobile</th>
                <th className="px-2.5 py-2.5">Discount</th>
                <th className="px-2.5 py-2.5">Status</th>
                <th className="px-2.5 py-2.5">Created</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-divider">
              {employees.length > 0 ? (
                employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-3 py-3">
                      <p className="font-semibold text-ds-text">{employee.employeeName}</p>
                      <p className="text-xs text-ds-muted">{employee.employeeCode}</p>
                    </td>
                    <td className="px-2.5 py-3 text-ds-text-3">
                      {employee.department || 'Not set'}
                    </td>
                    <td className="px-2.5 py-3 text-ds-text-3">
                      {employee.designation || 'Not set'}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3 text-ds-text-3">
                      {employee.mobile || 'Not set'}
                    </td>
                    <td className="px-2.5 py-3">
                      <Badge variant={employee.eligibleForDiscount ? 'success' : 'neutral'}>
                        {employee.eligibleForDiscount ? 'Eligible' : 'Not eligible'}
                      </Badge>
                    </td>
                    <td className="px-2.5 py-3">
                      <StatusBadge isActive={employee.isActive} />
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <p className="text-ds-text-3">{formatDateOnly(employee.createdAt)}</p>
                      <p className="text-xs text-ds-muted">{formatTimeOnly(employee.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          aria-label={`View ${employee.employeeName}`}
                          className="h-9 w-9"
                          onClick={() => setDialog({ employee, mode: 'view' })}
                          size="icon"
                          title="View"
                          type="button"
                          variant="outline"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Edit ${employee.employeeName}`}
                          className="h-9 w-9"
                          onClick={() => openEdit(employee)}
                          size="icon"
                          title="Edit"
                          type="button"
                          variant="outline"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={8}
                  error={employeesQuery.error}
                  isError={employeesQuery.isError}
                  isLoading={employeesQuery.isLoading}
                  label="employees"
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

      <Modal
        footer={
          dialog?.mode === 'view' ? (
            // Separate keys: React must not reuse the Edit button as the form's submit button,
            // or the click that switches to edit mode would also submit the form.
            <div
              className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
              key="view-footer"
            >
              <Button onClick={closeDialog} type="button" variant="outline">
                Close
              </Button>
              <Button onClick={() => openEdit(dialog.employee)} type="button">
                <Pencil className="h-4 w-4" />
                Edit employee
              </Button>
            </div>
          ) : (
            <div
              className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
              key="form-footer"
            >
              <Button onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={!canSave || saveEmployeeMutation.isPending}
                form="employee-form"
                type="submit"
              >
                {saveEmployeeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : dialog?.mode === 'create' ? (
                  <Plus className="h-4 w-4" />
                ) : null}
                {dialog?.mode === 'create' ? 'Create employee' : 'Save changes'}
              </Button>
            </div>
          )
        }
        onClose={closeDialog}
        open={dialog !== null}
        title={dialogTitle}
      >
        {dialog?.mode === 'view' ? (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-bold text-ds-text">{dialog.employee.employeeName}</p>
              <p className="text-[13px] text-ds-muted">{dialog.employee.employeeCode}</p>
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {[
                ['Department', dialog.employee.department || 'Not set'],
                ['Designation', dialog.employee.designation || 'Not set'],
                ['Mobile', dialog.employee.mobile || 'Not set'],
                ['Created', formatDate(dialog.employee.createdAt)],
                ['Updated', formatDate(dialog.employee.updatedAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-ds-muted">{label}</dt>
                  <dd className="mt-0.5 wrap-break-word text-sm font-medium text-ds-text">
                    {value}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-xs font-semibold text-ds-muted">Discount</dt>
                <dd className="mt-1">
                  <Badge variant={dialog.employee.eligibleForDiscount ? 'success' : 'neutral'}>
                    {dialog.employee.eligibleForDiscount ? 'Eligible' : 'Not eligible'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ds-muted">Status</dt>
                <dd className="mt-1">
                  <StatusBadge isActive={dialog.employee.isActive} />
                </dd>
              </div>
            </dl>
          </div>
        ) : dialog ? (
          <form
            className="grid gap-4"
            id="employee-form"
            onSubmit={(event) => {
              void handleSubmit(event);
            }}
          >
            <EmployeeFormFields form={form} />
          </form>
        ) : null}
      </Modal>
    </section>
  );
}

export function EmployeeCreatePageClient() {
  const form = useForm<EmployeeFormValues>({
    defaultValues: emptyEmployeeFormValues(),
  });
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  const createEmployeeMutation = useMutation({
    mutationFn: (body: EmployeeInput) => organizationApi.createEmployee(body),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Employee was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      const href = recordHref('/masters/employees', { name: response.data.employeeCode });
      invalidateEmployeeQueries(queryClient);
      showToast({
        action: { href, label: `View ${response.data.employeeName}` },
        title: 'Employee created',
        variant: 'success',
      });
      router.push(href);
    },
  });

  const formValues = form.watch();
  const canSubmit =
    Boolean(formValues.employeeCode?.trim()) && Boolean(formValues.employeeName?.trim());

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = employeeSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    createEmployeeMutation.mutate({
      department: optionalValue(parsed.data.department),
      designation: optionalValue(parsed.data.designation),
      eligibleForDiscount: parsed.data.eligibleForDiscount,
      employeeCode: parsed.data.employeeCode,
      employeeName: parsed.data.employeeName,
      isActive: parsed.data.isActive,
      mobile: optionalValue(parsed.data.mobile),
    });
  });

  return (
    <FormShell
      backHref="/masters/employees"
      icon={UsersRound}
      subtitle="Create an employee record for future staff discount checks."
      title="Create Employee"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <EmployeeFormFields form={form} />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmit}
            isPending={createEmployeeMutation.isPending}
            label="Create Employee"
          />
        </div>
      </form>
    </FormShell>
  );
}
