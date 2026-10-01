'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Eye,
  IndianRupee,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
  UsersRound,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
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
import { FilterTabs, Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
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
          ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
          : 'border-teal-200 text-teal-700 hover:bg-teal-50'
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
        <td className="px-4 py-12 text-center text-sm text-red-600" colSpan={colSpan}>
          {getApiErrorMessage(error)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        <div className="mx-auto max-w-sm">
          <p className="text-sm font-semibold text-slate-900">No {label} found</p>
          <p className="mt-1 text-sm text-slate-500">Create a record or adjust the filters.</p>
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
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
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
    <label className="flex min-h-10 items-center gap-3 rounded-md border bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
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
              className="flex min-h-control cursor-pointer items-center gap-2 rounded-control border border-ds-input bg-ds-surface px-3 text-sm font-medium text-ds-text-2 transition has-[:checked]:border-ds-primary has-[:checked]:bg-ds-primary-soft has-[:checked]:text-ds-link has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ds-primary"
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
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg shadow-slate-900/10 dark:border-slate-800 dark:bg-slate-950"
            id="price-item-options"
            role="listbox"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-slate-500">Loading active items...</div>
            ) : hasItems ? (
              items?.map((item) => (
                <button
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-slate-700 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-950 dark:hover:text-teal-100"
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
                    <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                      Selected
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-slate-500">
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
          <p className="text-sm text-slate-500">
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
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
          <Button asChild>
            <Link href="/masters/item-categories/new">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
        }
        eyebrow="Master Data"
        icon={Tags}
        subtitle="Configure global item grouping reusable across hospitals."
        title="Item Categories"
      />

      {editingCategory ? (
        <Panel className="p-4">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">Edit Category</h2>
            <p className="text-sm text-slate-500">Update category details and status.</p>
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
            value={search}
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
              <tr>
                <th className="w-[24%] px-4 py-2.5">Category Name</th>
                <th className="w-[11%] px-4 py-2.5">Status</th>
                <th className="w-[14%] px-4 py-2.5">Active / Inactive</th>
                <th className="w-[18%] px-4 py-2.5">Created Date Time</th>
                <th className="w-[18%] px-4 py-2.5">Updated Date Time</th>
                <th className="w-[15%] px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((category) => (
                  <tr className="hover:bg-slate-50" key={category.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {category.categoryName}
                    </td>
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
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(category.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
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
                          className="border-red-200 text-red-700 hover:bg-red-50"
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
    onSuccess() {
      invalidateItemCategoryQueries(queryClient);
      showToast({
        title: 'Category created',
        variant: 'success',
      });
      router.push('/masters/item-categories');
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
const categoryTints = [
  'bg-ds-tile-locations-bg text-ds-tile-locations-fg dark:bg-teal-950 dark:text-teal-300',
  'bg-ds-tile-kitchens-bg text-ds-tile-kitchens-fg dark:bg-amber-950 dark:text-amber-300',
  'bg-ds-tile-items-bg text-ds-tile-items-fg dark:bg-sky-950 dark:text-sky-300',
  'bg-ds-tile-restaurants-bg text-ds-tile-restaurants-fg dark:bg-violet-950 dark:text-violet-300',
  'bg-ds-tile-employees-bg text-ds-tile-employees-fg dark:bg-rose-950 dark:text-rose-300',
  'bg-ds-tile-stores-bg text-ds-tile-stores-fg dark:bg-emerald-950 dark:text-emerald-300',
];

function categoryTint(categoryId: string): string {
  let hash = 0;

  for (const character of categoryId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return categoryTints[hash % categoryTints.length] ?? '';
}

export function ItemsPageClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [foodTypeFilter, setFoodTypeFilter] = useState<FoodTypeFilter>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
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
        limit: listLimit,
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
        search,
        sortBy,
        sortOrder,
      },
    ],
  });

  const saveItemMutation = useMutation({
    mutationFn: (body: ItemInput) =>
      editingItem
        ? organizationApi.updateItem(editingItem.id, body)
        : organizationApi.createItem(body),
    onError(error) {
      const message = getApiErrorMessage(error);

      if (message === similarItemError) {
        form.setError('itemName', { message });
      }

      showToast({
        description: message,
        title: editingItem ? 'Item was not updated' : 'Item was not created',
        variant: 'error',
      });
    },
    onSuccess(response) {
      invalidateItemQueries(queryClient);
      showToast({
        description: editingItem ? undefined : `Generated item code: ${response.data.itemCode}`,
        title: editingItem ? 'Item updated' : 'Item created',
        variant: 'success',
      });
      setEditingItem(null);
      form.reset(emptyItemFormValues());
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

  const items = itemsQuery.data?.items ?? [];
  const meta = itemsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };

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

  function startEditingItem(item: Item) {
    setEditingItem(item);
    form.reset(itemToFormValues(item));
  }

  function cancelEditingItem() {
    setEditingItem(null);
    form.reset(emptyItemFormValues());
  }

  function deleteItem(item: Item) {
    const shouldDelete = window.confirm(`Delete ${item.itemName}?`);

    if (shouldDelete) {
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

  const advancedFilterCount = [activeFilter, foodTypeFilter, itemTypeFilter].filter(Boolean).length;

  return (
    <section className="space-y-5">
      <PageHeader
        action={
          <Button asChild className="h-cta px-5">
            <Link href="/masters/items/new">
              <Plus className="h-[18px] w-[18px]" />
              Add item
            </Link>
          </Button>
        }
        eyebrow="Item & Menu Setup"
        icon={PackageOpen}
        subtitle="Create items once, then map them to restaurants and kitchens across every location."
        title="Menu items"
      />

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-5',
          editingItem && 'xl:grid-cols-[minmax(0,1fr)_400px]',
        )}
      >
        <Panel className="min-w-0 overflow-hidden">
          <div className="border-b border-ds-divider p-4">
            <FilterTabs
              label="Item category"
              onChange={(value) => {
                setCategoryFilter(value);
                setPage(1);
              }}
              options={[
                { label: 'All', value: '' },
                ...(categoryOptionsQuery.data ?? []).map((category) => ({
                  label: category.categoryName,
                  value: category.id,
                })),
              ].map((option) =>
                option.value === categoryFilter && !itemsQuery.isLoading
                  ? { ...option, count: meta.total }
                  : option,
              )}
              value={categoryFilter}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3 border-b border-ds-divider p-4">
            <div className="min-w-[220px] flex-1">
              <SearchInput
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                value={search}
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                aria-label="Sort by"
                onChange={(event) => {
                  setSortBy(event.target.value);
                  setPage(1);
                }}
                value={sortBy}
              >
                <option value="createdAt">Recently added</option>
                <option value="itemName">Item name</option>
                <option value="itemCode">Item code</option>
                <option value="itemType">Item type</option>
                <option value="type">Food type</option>
                <option value="preparationTimeMinutes">Preparation time</option>
                <option value="hsnCode">HSN code</option>
                <option value="updatedAt">Updated date</option>
                <option value="isActive">Status</option>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <SortOrderSelect
                onChange={(value) => {
                  setSortOrder(value);
                  setPage(1);
                }}
                value={sortOrder}
              />
            </div>
            <Button
              aria-expanded={showMoreFilters}
              onClick={() => setShowMoreFilters((current) => !current)}
              type="button"
              variant="outline"
            >
              <SlidersHorizontal className="h-4 w-4" />
              More filters
              {advancedFilterCount ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ds-primary px-1.5 text-xs font-bold text-white">
                  {advancedFilterCount}
                </span>
              ) : null}
            </Button>
            <Button
              aria-label="Refresh items"
              onClick={() => void itemsQuery.refetch()}
              size="icon"
              type="button"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <p className="text-sm text-ds-muted" aria-live="polite">
              {itemsQuery.isLoading
                ? 'Loading…'
                : `${meta.total} item${meta.total === 1 ? '' : 's'}`}
            </p>
            {showMoreFilters ? (
              <div className="grid w-full gap-3 sm:grid-cols-3">
                <ActiveFilterSelect
                  onChange={(value) => {
                    setActiveFilter(value);
                    setPage(1);
                  }}
                  value={activeFilter}
                />
                <Select
                  aria-label="Food type"
                  onChange={(event) => {
                    setFoodTypeFilter(event.target.value as FoodTypeFilter);
                    setPage(1);
                  }}
                  value={foodTypeFilter}
                >
                  <option value="">All food types</option>
                  {foodTypeValues.map((type) => (
                    <option key={type} value={type}>
                      {foodTypeFormLabels[type]}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Item type"
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
              </div>
            ) : null}
          </div>

          <div className="p-4">
            {itemsQuery.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton className="h-64 rounded-card" key={`item-skeleton-${index}`} />
                ))}
              </div>
            ) : itemsQuery.isError ? (
              <p className="rounded-tile bg-ds-rejected-bg px-4 py-6 text-center text-sm font-medium text-ds-rejected-fg dark:bg-red-950 dark:text-red-300">
                {getApiErrorMessage(itemsQuery.error)}
              </p>
            ) : items.length > 0 ? (
              <div
                className={cn(
                  'grid gap-4 sm:grid-cols-2',
                  editingItem ? '2xl:grid-cols-3' : 'lg:grid-cols-3 2xl:grid-cols-4',
                )}
              >
                {items.map((item) => {
                  const tint = categoryTint(item.categoryId);

                  return (
                    <article
                      className={cn(
                        'flex flex-col overflow-hidden rounded-card border border-ds-border bg-ds-surface',
                        editingItem?.id === item.id && 'ring-2 ring-ds-primary',
                      )}
                      key={item.id}
                    >
                      <div className={cn('relative grid h-20 place-items-center', tint)}>
                        <span className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-ds-surface/90 px-2.5 py-1 text-xs font-semibold text-ds-text-2">
                          {item.category.categoryName}
                        </span>
                        <Utensils aria-hidden="true" className="h-7 w-7" strokeWidth={1.8} />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start gap-2">
                          <span className="pt-0.5">
                            <FoodTypeMarker type={item.type} />
                          </span>
                          <h3 className="min-w-0 break-words font-bold leading-5 text-ds-text">
                            {item.itemName}
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-ds-muted">
                          {item.itemCode} · {formatEnum(item.itemType)}
                        </p>
                        {item.preparationTimeMinutes || item.hsnCode ? (
                          <p className="mt-1 text-xs text-ds-muted">
                            {[
                              item.preparationTimeMinutes
                                ? `${item.preparationTimeMinutes} min prep`
                                : null,
                              item.hsnCode ? `HSN ${item.hsnCode}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        ) : null}
                        <div className="mt-auto pt-4">
                          <div className="flex items-center justify-between gap-2 border-t border-ds-divider pt-3">
                            <span
                              className={cn(
                                'text-[13px] font-medium',
                                item.isActive ? 'text-ds-teal-text' : 'text-ds-muted',
                              )}
                            >
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                aria-label={`Edit ${item.itemName}`}
                                onClick={() => startEditingItem(item)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                aria-label={`Delete ${item.itemName}`}
                                className="text-ds-rejected-fg hover:bg-ds-rejected-bg hover:text-ds-rejected-fg dark:text-red-300"
                                disabled={deleteItemMutation.isPending}
                                onClick={() => deleteItem(item)}
                                size="icon"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <span className="pl-1">
                                <Toggle
                                  ariaLabel={`${item.itemName} active`}
                                  checked={item.isActive}
                                  disabled={toggleItemStatusMutation.isPending}
                                  onChange={() => toggleItemStatus(item)}
                                />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                description="Create an item or adjust the filters."
                title="No items found"
              />
            )}
          </div>
          <PaginationControls
            limit={meta.limit}
            onPageChange={setPage}
            page={meta.page}
            total={meta.total}
            totalPages={meta.totalPages}
          />
        </Panel>

        {editingItem ? (
          <Panel className="order-first p-4 xl:order-none">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-ds-teal-text">
                  Edit item
                </p>
                <h2 className="mt-1 break-words text-xl font-extrabold text-ds-text">
                  {editingItem.itemName}
                </h2>
                <p className="mt-1 text-[13px] text-ds-muted">Update item details and status.</p>
              </div>
              <Button
                aria-label="Close edit panel"
                className="shrink-0"
                onClick={cancelEditingItem}
                size="icon"
                type="button"
                variant="outline"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
              <ItemFormFields categories={categoryOptionsQuery.data} form={form} />
              {categoryOptionsQuery.isError ? (
                <p className="text-sm font-medium text-ds-rejected-fg dark:text-red-300">
                  {getApiErrorMessage(categoryOptionsQuery.error)}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3 border-t border-ds-divider pt-5">
                <Button onClick={cancelEditingItem} type="button" variant="outline">
                  Cancel
                </Button>
                <SubmitButton isPending={saveItemMutation.isPending} label="Save item" />
              </div>
            </form>
          </Panel>
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
      invalidateItemQueries(queryClient);
      showToast({
        description: `Generated item code: ${response.data.itemCode}`,
        title: 'Item created',
        variant: 'success',
      });
      router.push('/masters/items');
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
          <p className="text-sm font-medium text-red-600">
            {getApiErrorMessage(categoryOptionsQuery.error)}
          </p>
        ) : null}
        {!categoryOptionsQuery.isLoading && !categoryOptionsQuery.data?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
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
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [restaurantFilter, setRestaurantFilter] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<ItemTypeFilter>('');
  const [rateTypeFilter, setRateTypeFilter] = useState<RateTypeFilter>('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const hospitalsQuery = useHospitalOptions();
  const restaurantsQuery = useRestaurantOptions(hospitalFilter);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    setHospitalFilter(scopedHospitalId ?? '');
    setRestaurantFilter('');
    setPage(1);
  }, [scopedHospitalId]);

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
          <Button asChild>
            <Link href="/masters/item-prices/new">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
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
            value={search}
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
          <table className="min-w-full table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
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
            <tbody className="divide-y divide-slate-100 bg-white">
              {items.length > 0 ? (
                items.map((price) => (
                  <tr className="hover:bg-slate-50" key={price.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">
                        {price.hospital.displayName ?? price.hospital.hospitalName}
                      </p>
                      <p className="text-xs text-slate-500">{price.hospital.hospitalCode}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {price.restaurant ? price.restaurant.restaurantName : 'All restaurants'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{price.item.itemName}</p>
                      <p className="text-xs text-slate-500">{price.item.itemCode}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatEnum(price.item.itemType)}</td>
                    <td className="px-4 py-3">
                      <Badge className="border-cyan-200 bg-cyan-50 text-cyan-700">
                        {formatEnum(price.rateType)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      {formatCurrency(price.price)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={price.isTaxInclusive ? 'success' : 'neutral'}>
                        {price.isTaxInclusive ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {price.gstPercent === null ? '-' : `${price.gstPercent}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateOnly(price.effectiveFrom)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
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
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(price.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(price.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild size="sm" type="button" variant="outline">
                          <Link href={`/masters/item-prices/${price.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          className="border-red-200 text-red-700 hover:bg-red-50"
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
    onSuccess() {
      invalidateItemPriceQueries(queryClient);
      showToast({
        title: 'Item price created',
        variant: 'success',
      });
      router.push('/masters/item-prices');
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
          <p className="text-sm font-medium text-red-600">
            {getApiErrorMessage(hospitalsQuery.error ?? restaurantsQuery.error)}
          </p>
        ) : null}
        {itemOptionsQuery.isError ? (
          <p className="text-sm font-medium text-red-600">
            Unable to load active items. Please try searching again or refresh the page.
          </p>
        ) : null}
        {!formValues.itemId && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
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
    onSuccess() {
      invalidateItemPriceQueries(queryClient);
      showToast({
        title: 'Item price updated',
        variant: 'success',
      });
      router.push('/masters/item-prices');
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
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
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
          <p className="text-sm font-medium text-red-600">
            {getApiErrorMessage(hospitalsQuery.error ?? restaurantsQuery.error)}
          </p>
        ) : null}
        {itemOptionsQuery.isError ? (
          <p className="text-sm font-medium text-red-600">
            Unable to load active items. Please try searching again or refresh the page.
          </p>
        ) : null}
        {!form.watch('itemId') && !itemOptionsQuery.isLoading && !itemOptionsQuery.data?.length ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
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
  | { mode: 'create' }
  | { employee: Employee; mode: 'edit' }
  | { employee: Employee; mode: 'view' };

export function EmployeesPageClient() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
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
            value={search}
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
            <tbody className="divide-y divide-slate-100">
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
                  <dd className="mt-0.5 break-words text-sm font-medium text-ds-text">{value}</dd>
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
    onSuccess() {
      invalidateEmployeeQueries(queryClient);
      showToast({
        title: 'Employee created',
        variant: 'success',
      });
      router.push('/masters/employees');
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
