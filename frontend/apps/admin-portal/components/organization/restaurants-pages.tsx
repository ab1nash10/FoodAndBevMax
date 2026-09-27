'use client';

import Link from 'next/link';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Badge, Field, Input, Panel, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import type { Restaurant, RestaurantInput, SortOrder } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Loader2, Pencil, Plus, QrCode, RefreshCw, Trash2, Utensils } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import type { Path } from 'react-hook-form';
import {
  ActiveFilterSelect,
  CheckboxLine,
  FormShell,
  FormWarning,
  ImageUploadField,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  SectionHeading,
  SortOrderSelect,
  SubmitButton,
  ToolbarGrid,
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  formatRestaurantLocationDisplay,
  formatRestaurantLocationOption,
  getRestaurantImageError,
  getRestaurantOptionBadges,
  hasRequiredText,
  isObjectUrl,
  isRestaurantOnline,
  isUuid,
  listLimit,
  restaurantFormDefaultValues,
  restaurantSchema,
  toRestaurantFormDefaults,
  toRestaurantInput,
  uploadRestaurantImage,
  useHospitalOptions,
} from './shared';
import type { ActiveFilter, RestaurantFormValues } from './shared';

function RestaurantThumbnail({ restaurant }: Readonly<{ restaurant: Restaurant }>) {
  if (restaurant.thumbnailUrl) {
    return (
      <div
        aria-label={`${restaurant.restaurantName} thumbnail`}
        className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-cover bg-center shadow-sm dark:border-slate-800"
        role="img"
        // Quoted, so a stored value cannot break out of url(); prefixed, so an uploaded
        // /uploads/... path resolves under the routing prefix like the avatars do.
        style={{ backgroundImage: `url(${JSON.stringify(withBasePath(restaurant.thumbnailUrl))})` }}
      />
    );
  }

  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-teal-100 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300">
      <Utensils className="h-6 w-6" />
    </span>
  );
}

function RestaurantOnlineSwitch({
  disabled,
  isOnline,
  onToggle,
}: Readonly<{
  disabled: boolean;
  isOnline: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      aria-checked={isOnline}
      aria-label={isOnline ? 'Set restaurant offline' : 'Set restaurant online'}
      className={cn(
        'inline-flex h-7 w-12 items-center rounded-full border p-1 transition focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:cursor-not-allowed disabled:opacity-60',
        isOnline
          ? 'border-teal-500 bg-teal-500'
          : 'border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'h-5 w-5 rounded-full bg-white shadow-sm transition',
          isOnline ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function RestaurantsPageClient() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { scopedHospitalId } = useLocationContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [onlineUpdatingId, setOnlineUpdatingId] = useState<string | null>(null);

  const restaurantsQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listRestaurants({
        hospitalId: scopedHospitalId,
        isActive: activeFilterToBoolean(activeFilter),
        limit: listLimit,
        page,
        search,
        sortBy,
        sortOrder,
      });

      return response.data;
    },
    queryKey: ['restaurants', { activeFilter, page, scopedHospitalId, search, sortBy, sortOrder }],
  });

  useEffect(() => {
    setPage(1);
  }, [scopedHospitalId]);

  const deleteRestaurantMutation = useMutation({
    mutationFn: (id: string) => organizationApi.deleteRestaurant(id),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Restaurant was not deleted',
        variant: 'error',
      });
    },
    onSettled() {
      setDeletingId(null);
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-options'] });
      showToast({
        title: 'Restaurant deleted',
        variant: 'success',
      });
    },
  });

  const onlineToggleMutation = useMutation({
    mutationFn: ({ id, nextIsOnline }: { id: string; nextIsOnline: boolean }) =>
      organizationApi.updateRestaurant(id, {
        isOnlineOrdersEnabled: nextIsOnline,
        onlineOrders: nextIsOnline,
        onlineOrderingEnabled: nextIsOnline,
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Online status was not updated',
        variant: 'error',
      });
    },
    onSettled() {
      setOnlineUpdatingId(null);
    },
    onSuccess(_, variables) {
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      showToast({
        title: variables.nextIsOnline ? 'Restaurant is online' : 'Restaurant is offline',
        variant: 'success',
      });
    },
  });

  const items = restaurantsQuery.data?.items ?? [];
  const meta = restaurantsQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  const sortOptions = [
    { label: 'Created date', value: 'createdAt' },
    { label: 'Restaurant name', value: 'restaurantName' },
    { label: 'Restaurant code', value: 'restaurantCode' },
    { label: 'Status', value: 'isActive' },
  ];

  const handleDelete = (restaurant: Restaurant) => {
    const shouldDelete = window.confirm(`Delete ${restaurant.restaurantName}?`);

    if (!shouldDelete) {
      return;
    }

    setDeletingId(restaurant.id);
    deleteRestaurantMutation.mutate(restaurant.id);
  };

  const handleOnlineToggle = (restaurant: Restaurant) => {
    setOnlineUpdatingId(restaurant.id);
    onlineToggleMutation.mutate({
      id: restaurant.id,
      nextIsOnline: !isRestaurantOnline(restaurant),
    });
  };

  return (
    <section className="space-y-6">
      <PageHeader
        action={
          <Button asChild className="bg-teal-600 hover:bg-teal-700">
            <Link href="/masters/restaurants/new">
              <Plus className="h-4 w-4" />
              Create
            </Link>
          </Button>
        }
        eyebrow="Organization"
        icon={Utensils}
        subtitle="Manage restaurant profiles and ordering availability."
        title="Restaurants"
      />
      <Panel>
        <ToolbarGrid>
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
            {sortOptions.map((option) => (
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
          <Button onClick={() => void restaurantsQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </ToolbarGrid>
        <div className="overflow-x-auto px-4 pb-4">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-3 text-left text-sm">
            <thead className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-[36%] px-4 py-2">Restaurant</th>
                <th className="w-[14%] px-4 py-2">Online</th>
                <th className="w-[30%] px-4 py-2">Status / Options</th>
                <th className="w-[20%] px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((restaurant) => {
                  const isOnline = isRestaurantOnline(restaurant);
                  const optionBadges = getRestaurantOptionBadges(restaurant);
                  const isDeleting = deletingId === restaurant.id;
                  const isOnlineUpdating = onlineUpdatingId === restaurant.id;

                  return (
                    <tr className="group" key={restaurant.id}>
                      <td className="rounded-l-xl border-y border-l border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition group-hover:border-teal-100 group-hover:bg-teal-50/30 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20 dark:group-hover:border-teal-900 dark:group-hover:bg-teal-950/20">
                        <div className="flex min-w-0 items-center gap-4">
                          <RestaurantThumbnail restaurant={restaurant} />
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-950 dark:text-slate-100">
                              {restaurant.restaurantName}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                              {formatRestaurantLocationDisplay(restaurant.hospital)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-400">
                              {restaurant.restaurantCode}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border-y border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition group-hover:border-teal-100 group-hover:bg-teal-50/30 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20 dark:group-hover:border-teal-900 dark:group-hover:bg-teal-950/20">
                        <div className="flex flex-col gap-2">
                          <RestaurantOnlineSwitch
                            disabled={isOnlineUpdating}
                            isOnline={isOnline}
                            onToggle={() => handleOnlineToggle(restaurant)}
                          />
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td className="border-y border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition group-hover:border-teal-100 group-hover:bg-teal-50/30 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20 dark:group-hover:border-teal-900 dark:group-hover:bg-teal-950/20">
                        <div className="flex flex-wrap gap-2">
                          {optionBadges.map((badge) => (
                            <Badge key={badge.label} variant={badge.variant}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-400">
                          Updated {formatDate(restaurant.updatedAt)}
                        </p>
                      </td>
                      <td className="rounded-r-xl border-y border-r border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5 transition group-hover:border-teal-100 group-hover:bg-teal-50/30 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20 dark:group-hover:border-teal-900 dark:group-hover:bg-teal-950/20">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/masters/restaurants/${restaurant.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Link>
                          </Button>
                          <Button
                            disabled={isDeleting}
                            onClick={() => handleDelete(restaurant)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Delete
                          </Button>
                          <Button
                            onClick={() =>
                              showToast({
                                title: 'QR printing will be available in QR module.',
                                variant: 'info',
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <QrCode className="h-4 w-4" />
                            Print QR
                          </Button>
                          <Button
                            onClick={() =>
                              showToast({
                                title:
                                  'Customer Orders Activity will be available in Restaurant Operations.',
                                variant: 'info',
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Activity className="h-4 w-4" />
                            Activity
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <QueryState
                  colSpan={4}
                  error={restaurantsQuery.error}
                  isError={restaurantsQuery.isError}
                  isLoading={restaurantsQuery.isLoading}
                  label="restaurants"
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

function RestaurantFormPageClient({ restaurantId }: Readonly<{ restaurantId?: string }>) {
  const isEditMode = Boolean(restaurantId);
  const { isLocationSelectorLocked, scopedHospitalId } = useLocationContext();
  const form = useForm<RestaurantFormValues>({
    defaultValues: {
      ...restaurantFormDefaultValues,
      hospitalId: scopedHospitalId ?? restaurantFormDefaultValues.hospitalId,
    },
  });
  const hospitalId = form.watch('hospitalId');
  const restaurantName = form.watch('restaurantName');
  const hospitalOptionsQuery = useHospitalOptions();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [coverFile, setCoverFile] = useState<File | undefined>();
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | undefined>();
  const [imageErrors, setImageErrors] = useState<{ cover?: string; thumbnail?: string }>({});
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | undefined>();
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | undefined>();
  const canSubmitRestaurant = isUuid(hospitalId) && hasRequiredText(restaurantName);

  const restaurantQuery = useQuery({
    enabled: isEditMode,
    queryFn: async () => {
      const response = await organizationApi.getRestaurant(restaurantId!);

      return response.data;
    },
    queryKey: ['restaurant', restaurantId],
  });

  useEffect(() => {
    if (!restaurantQuery.data) {
      return;
    }

    form.reset(toRestaurantFormDefaults(restaurantQuery.data));
    setThumbnailPreviewUrl(restaurantQuery.data.thumbnailUrl ?? undefined);
    setCoverPreviewUrl(restaurantQuery.data.coverImageUrl ?? undefined);
    setThumbnailFile(undefined);
    setCoverFile(undefined);
  }, [form, restaurantQuery.data]);

  useEffect(() => {
    if (!isEditMode && scopedHospitalId && form.getValues('hospitalId') !== scopedHospitalId) {
      form.setValue('hospitalId', scopedHospitalId, { shouldValidate: true });
    }
  }, [form, isEditMode, scopedHospitalId]);

  useEffect(() => {
    return () => {
      if (isObjectUrl(coverPreviewUrl)) {
        URL.revokeObjectURL(coverPreviewUrl);
      }
    };
  }, [coverPreviewUrl]);

  useEffect(() => {
    return () => {
      if (isObjectUrl(thumbnailPreviewUrl)) {
        URL.revokeObjectURL(thumbnailPreviewUrl);
      }
    };
  }, [thumbnailPreviewUrl]);

  const saveRestaurantMutation = useMutation({
    mutationFn: (body: RestaurantInput) =>
      restaurantId
        ? organizationApi.updateRestaurant(restaurantId, body)
        : organizationApi.createRestaurant(body),
    onSuccess(response) {
      void queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-options'] });
      if (restaurantId) {
        void queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
      }
      showToast({
        description: response.data.restaurantCode
          ? `Restaurant Code: ${response.data.restaurantCode}`
          : undefined,
        title: restaurantId ? 'Restaurant updated' : 'Restaurant created',
        variant: 'success',
      });
      router.push('/masters/restaurants');
    },
  });

  const handleImageChange =
    (imageType: 'cover' | 'thumbnail') => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      const error = getRestaurantImageError(file);

      if (error) {
        setImageErrors((current) => ({ ...current, [imageType]: error }));
        event.target.value = '';
        return;
      }

      const previewUrl = URL.createObjectURL(file);

      setImageErrors((current) => ({ ...current, [imageType]: undefined }));

      if (imageType === 'thumbnail') {
        setThumbnailFile(file);
        setThumbnailPreviewUrl((currentPreviewUrl) => {
          if (isObjectUrl(currentPreviewUrl)) URL.revokeObjectURL(currentPreviewUrl);
          return previewUrl;
        });
      } else {
        setCoverFile(file);
        setCoverPreviewUrl((currentPreviewUrl) => {
          if (isObjectUrl(currentPreviewUrl)) URL.revokeObjectURL(currentPreviewUrl);
          return previewUrl;
        });
      }
    };

  const handleSubmit = form.handleSubmit(async (values) => {
    const parsed = restaurantSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    setIsUploadingImages(true);

    try {
      const [thumbnailUrl, coverImageUrl] = await Promise.all([
        thumbnailFile
          ? uploadRestaurantImage(thumbnailFile)
          : Promise.resolve(restaurantQuery.data?.thumbnailUrl ?? undefined),
        coverFile
          ? uploadRestaurantImage(coverFile)
          : Promise.resolve(restaurantQuery.data?.coverImageUrl ?? undefined),
      ]);

      await saveRestaurantMutation.mutateAsync(
        toRestaurantInput(parsed.data, {
          coverImageUrl,
          thumbnailUrl,
        }),
      );
    } catch (error) {
      showToast({
        description: getApiErrorMessage(error),
        title: restaurantId ? 'Restaurant was not updated' : 'Restaurant was not created',
        variant: 'error',
      });
    } finally {
      setIsUploadingImages(false);
    }
  });

  if (isEditMode && restaurantQuery.isLoading) {
    return (
      <FormShell
        backHref="/masters/restaurants"
        icon={Utensils}
        subtitle="Load restaurant details for editing."
        title="Update Restaurant"
      >
        <div className="grid gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
          <Skeleton className="h-40" />
        </div>
      </FormShell>
    );
  }

  if (isEditMode && restaurantQuery.isError) {
    return (
      <FormShell
        backHref="/masters/restaurants"
        icon={Utensils}
        subtitle="Load restaurant details for editing."
        title="Update Restaurant"
      >
        <p className="text-sm font-medium text-red-600">
          {getApiErrorMessage(restaurantQuery.error)}
        </p>
      </FormShell>
    );
  }

  return (
    <FormShell
      backHref="/masters/restaurants"
      icon={Utensils}
      subtitle={
        isEditMode
          ? 'Update restaurant profile for location food service.'
          : 'Create a restaurant profile for location food service.'
      }
      title={isEditMode ? 'Update Restaurant' : 'Create Restaurant'}
    >
      <form
        className="grid gap-7"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="space-y-4">
          <SectionHeading title="Basic Information" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={form.formState.errors.hospitalId?.message}
              label="Location"
              name="restaurant-location"
            >
              <Select
                disabled={hospitalOptionsQuery.isLoading || isLocationSelectorLocked}
                id="restaurant-location"
                {...form.register('hospitalId')}
              >
                <option value="">Select location</option>
                {hospitalOptionsQuery.data?.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {formatRestaurantLocationOption(hospital)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              error={form.formState.errors.restaurantName?.message}
              label="Name"
              name="restaurant-name"
            >
              <Input id="restaurant-name" {...form.register('restaurantName')} />
            </Field>
            {isEditMode ? (
              <Field label="Restaurant Code" name="restaurant-code">
                <Input
                  id="restaurant-code"
                  readOnly
                  value={restaurantQuery.data?.restaurantCode ?? 'Auto-generated'}
                />
              </Field>
            ) : null}
            <Field
              error={form.formState.errors.email?.message}
              label="Email"
              name="restaurant-email"
            >
              <Input id="restaurant-email" {...form.register('email')} />
            </Field>
            <Field
              error={form.formState.errors.mobile?.message}
              label="Mobile"
              name="restaurant-mobile"
            >
              <Input id="restaurant-mobile" {...form.register('mobile')} />
            </Field>
          </div>
          <CheckboxLine
            input={<input className="h-4 w-4" type="checkbox" {...form.register('isActive')} />}
          >
            Active
          </CheckboxLine>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="FSSAI" />
          <Field
            error={form.formState.errors.fssaiNumbers?.message}
            label="FSSAI"
            name="restaurant-fssai"
          >
            <Input
              id="restaurant-fssai"
              placeholder="12345678901234, 98765432109876"
              {...form.register('fssaiNumbers')}
            />
          </Field>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="Images" />
          <div className="grid gap-5 sm:grid-cols-2">
            <ImageUploadField
              error={imageErrors.thumbnail}
              id="restaurant-thumbnail"
              label="Thumbnail upload"
              onChange={handleImageChange('thumbnail')}
              previewUrl={thumbnailPreviewUrl}
            />
            <ImageUploadField
              error={imageErrors.cover}
              id="restaurant-cover"
              label="Cover upload"
              onChange={handleImageChange('cover')}
              previewUrl={coverPreviewUrl}
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="GST Information" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={form.formState.errors.panNumber?.message}
              label="PAN Number"
              name="restaurant-pan"
            >
              <Input id="restaurant-pan" {...form.register('panNumber')} />
            </Field>
            <Field
              error={form.formState.errors.gstNumber?.message}
              label="GST Number"
              name="restaurant-gst"
            >
              <Input id="restaurant-gst" {...form.register('gstNumber')} />
            </Field>
            <Field
              error={form.formState.errors.legalName?.message}
              label="Legal Name"
              name="restaurant-legal-name"
            >
              <Input id="restaurant-legal-name" {...form.register('legalName')} />
            </Field>
          </div>
          <Field
            error={form.formState.errors.address?.message}
            label="Address"
            name="restaurant-address"
          >
            <Input id="restaurant-address" {...form.register('address')} />
          </Field>
          <CheckboxLine
            input={
              <input className="h-4 w-4" type="checkbox" {...form.register('isRegisteredInGst')} />
            }
          >
            Registered in GST
          </CheckboxLine>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="Banking Information" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={form.formState.errors.unitNameForQr?.message}
              label="Unit Name for QR Code"
              name="restaurant-qr-unit"
            >
              <Input id="restaurant-qr-unit" {...form.register('unitNameForQr')} />
            </Field>
            <Field
              error={form.formState.errors.bankNameBranch?.message}
              label="Bank Name & Branch"
              name="restaurant-bank"
            >
              <Input id="restaurant-bank" {...form.register('bankNameBranch')} />
            </Field>
            <Field
              error={form.formState.errors.ifscCode?.message}
              label="IFSC Code"
              name="restaurant-ifsc"
            >
              <Input id="restaurant-ifsc" {...form.register('ifscCode')} />
            </Field>
            <Field
              error={form.formState.errors.accountNumber?.message}
              label="Account Number"
              name="restaurant-account"
            >
              <Input id="restaurant-account" {...form.register('accountNumber')} />
            </Field>
            <Field
              error={form.formState.errors.upiId?.message}
              label="UPI ID"
              name="restaurant-upi"
            >
              <Input id="restaurant-upi" {...form.register('upiId')} />
            </Field>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="More Options" />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['isOffline', 'Offline'],
              ['isOpen24x7', 'Open 24x7'],
              ['isVegOnly', 'Veg Only'],
              ['isTakeawayEnabled', 'Takeaway'],
              ['isDeliveryEnabled', 'Delivery'],
              ['isHomeDeliveryEnabled', 'Home Delivery'],
              ['isAtTableDiningEnabled', 'At Table Dining'],
              ['isInRoomDiningEnabled', 'In Room Dining'],
              ['isInCarDiningEnabled', 'In Car Dining'],
              ['isPosOrdersEnabled', 'POS Orders'],
              ['isOnlineOrdersEnabled', 'Online Orders'],
              ['isInventoryEnabled', 'Inventory'],
            ].map(([name, label]) => (
              <CheckboxLine
                input={
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    {...form.register(name as Path<RestaurantFormValues>)}
                  />
                }
                key={name}
              >
                {label}
              </CheckboxLine>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="Sodexo Information" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              error={form.formState.errors.sodexoMid?.message}
              label="Sodexo MID"
              name="restaurant-sodexo-mid"
            >
              <Input id="restaurant-sodexo-mid" {...form.register('sodexoMid')} />
            </Field>
            <Field
              error={form.formState.errors.sodexoTid?.message}
              label="Sodexo TID"
              name="restaurant-sodexo-tid"
            >
              <Input id="restaurant-sodexo-tid" {...form.register('sodexoTid')} />
            </Field>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <SectionHeading title="ERP Fields" />
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              error={form.formState.errors.sunBu?.message}
              label="Field SUN BU"
              name="restaurant-sun-bu"
            >
              <Input id="restaurant-sun-bu" {...form.register('sunBu')} />
            </Field>
            <Field
              error={form.formState.errors.sunT1?.message}
              label="Field T1"
              name="restaurant-sun-t1"
            >
              <Input id="restaurant-sun-t1" {...form.register('sunT1')} />
            </Field>
            <Field
              error={form.formState.errors.sunT2?.message}
              label="Field T2"
              name="restaurant-sun-t2"
            >
              <Input id="restaurant-sun-t2" {...form.register('sunT2')} />
            </Field>
          </div>
        </div>
        <FormWarning
          isVisible={hospitalOptionsQuery.isError}
          message={getApiErrorMessage(hospitalOptionsQuery.error)}
        />
        <div className="flex justify-end">
          <SubmitButton
            disabled={!canSubmitRestaurant}
            isPending={saveRestaurantMutation.isPending || isUploadingImages}
            label={isEditMode ? 'Update Restaurant' : 'Create Restaurant'}
          />
        </div>
      </form>
    </FormShell>
  );
}

export function RestaurantCreatePageClient() {
  return <RestaurantFormPageClient />;
}

export function RestaurantEditPageClient({ restaurantId }: Readonly<{ restaurantId: string }>) {
  return <RestaurantFormPageClient restaurantId={restaurantId} />;
}
