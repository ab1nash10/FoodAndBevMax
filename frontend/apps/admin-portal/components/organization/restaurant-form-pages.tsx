'use client';

import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import type { RestaurantInput } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Utensils } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { SectionHeading } from '@/components/organization/shared/list-controls';
import {
  CheckboxLine,
  FormShell,
  FormWarning,
  ImageUploadField,
  SubmitButton,
} from '@/components/organization/shared/form-controls';
import { applyValidationErrors, hasRequiredText } from '@/components/organization/shared/utils';
import { formatRestaurantLocationOption } from '@/components/organization/shared/locations';
import {
  getRestaurantImageError,
  isObjectUrl,
  restaurantFormDefaultValues,
  toRestaurantFormDefaults,
  toRestaurantInput,
  uploadRestaurantImage,
} from '@/components/organization/shared/restaurants';
import { restaurantSchema, isUuid } from '@/components/organization/shared/schemas';
import { useHospitalOptions } from '@/components/organization/shared/hooks';
import type { RestaurantFormValues } from '@/components/organization/shared/types';
import { queryKeys } from '@/lib/query-keys';
import { restaurantDetailQuery } from '@/lib/detail-queries';

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
    ...restaurantDetailQuery(restaurantId),
    enabled: isEditMode,
  });
  useBreadcrumbLabel(
    restaurantId,
    restaurantQuery.data?.restaurantName ?? (restaurantQuery.isError ? 'Not found' : undefined),
  );

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
      const href = recordHref('/masters/restaurants', {
        name: response.data.restaurantCode || response.data.restaurantName,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurantOptions() });
      if (restaurantId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.restaurant(restaurantId) });
      }
      showToast({
        action: { href, label: `View ${response.data.restaurantName}` },
        description: response.data.restaurantCode
          ? `Restaurant Code: ${response.data.restaurantCode}`
          : undefined,
        title: restaurantId ? 'Restaurant updated' : 'Restaurant created',
        variant: 'success',
      });
      router.push(href);
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
        <p className="text-sm font-medium text-ds-status-bad-fg">
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
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
          <SectionHeading title="Images" />
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
          <SectionHeading title="GST Information" />
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
          <SectionHeading title="Banking Information" />
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
          <SectionHeading title="Sodexo Information" />
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 border-t border-ds-divider pt-6">
          <SectionHeading title="ERP Fields" />
          <div className="grid gap-4 sm:grid-cols-3">
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
