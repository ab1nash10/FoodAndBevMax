'use client';

import { useBreadcrumbLabel } from '@/components/breadcrumbs';
import { useLocationContext } from '@/components/location-context';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select, Skeleton } from '@/components/ui';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { recordHref } from '@/lib/navigation';
import type { RestaurantInput } from '@aahar/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@aahar/ui';
import { BadgePercent, Utensils } from 'lucide-react';
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
import { applyValidationErrors } from '@/components/organization/shared/utils';
import { formatRestaurantLocationOption } from '@/components/organization/shared/locations';
import {
  getRestaurantImageError,
  isObjectUrl,
  restaurantFormDefaultValues,
  toRestaurantFormDefaults,
  toRestaurantInput,
  uploadRestaurantImage,
} from '@/components/organization/shared/restaurants';
import { restaurantSchema } from '@/components/organization/shared/schemas';
import { useHospitalOptions, useLegalEntityOptions } from '@/components/organization/shared/hooks';
import { LegalEntitySelect } from '@/components/organization/shared/legal-entity-select';
import type { RestaurantFormValues } from '@/components/organization/shared/types';
import { StaffDiscountPanel } from '@/components/organization/staff-discount-panel';
import { queryKeys } from '@/lib/query-keys';
import { restaurantDetailQuery } from '@/lib/detail-queries';

const requiredFields = restaurantSchema.pick({ hospitalId: true, restaurantName: true });

function RestaurantFormPageClient({ restaurantId }: Readonly<{ restaurantId?: string }>) {
  const isEditMode = Boolean(restaurantId);
  const { isAllLocations, scopedHospitalId } = useLocationContext();
  const form = useForm<RestaurantFormValues>({
    defaultValues: {
      ...restaurantFormDefaultValues,
      hospitalId: scopedHospitalId ?? restaurantFormDefaultValues.hospitalId,
    },
  });
  const hospitalId = form.watch('hospitalId');
  const restaurantName = form.watch('restaurantName');
  const hospitalOptionsQuery = useHospitalOptions();
  const legalEntitiesQuery = useLegalEntityOptions();
  const legalEntityField = form.register('legalEntityId');
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [coverFile, setCoverFile] = useState<File | undefined>();
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | undefined>();
  const [imageErrors, setImageErrors] = useState<{ cover?: string; thumbnail?: string }>({});
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isStaffDiscountOpen, setIsStaffDiscountOpen] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | undefined>();
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | undefined>();
  // The first required field still missing, in the schema's own words.
  const disabledReason = requiredFields.safeParse({ hospitalId, restaurantName }).error?.issues[0]
    ?.message;

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
              required
            >
              <Select
                disabled={hospitalOptionsQuery.isLoading || !isAllLocations}
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
              required
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
            input={
              <input
                className="h-4 w-4"
                type="checkbox"
                {...form.register('isActive', {
                  // Offline means not active: the two always move together.
                  onChange: (event: { target: { checked: boolean } }) =>
                    form.setValue('isOffline', !event.target.checked, { shouldDirty: true }),
                })}
              />
            }
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
          <Field
            error={form.formState.errors.legalEntityId?.message}
            label="Entity"
            name="restaurant-legal-entity"
          >
            <LegalEntitySelect
              id="restaurant-legal-entity"
              value={form.watch('legalEntityId')}
              {...legalEntityField}
              onChange={(event) => {
                void legalEntityField.onChange(event);
                // Choosing an entity fills its GST details; they stay editable.
                const entity = legalEntitiesQuery.data?.find(
                  (option) => option.id === event.target.value,
                );

                if (entity) {
                  const filled = { shouldDirty: true, shouldValidate: true };

                  form.setValue('legalName', entity.entityName, filled);
                  form.setValue('gstNumber', entity.gstNumber, filled);
                  form.setValue('address', entity.entityAddress, filled);
                  form.setValue('isRegisteredInGst', true, filled);
                }
              }}
            />
          </Field>
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
              ['isPosOrdersEnabled', 'POS Orders'],
              ['isInRoomDiningEnabled', 'In Room Dining'],
              ['isTakeawayEnabled', 'Takeaway'],
              ['isOnlineOrdersEnabled', 'Online Orders'],
              ['isInventoryEnabled', 'Inventory'],
              ['isIhcOnly', 'IHC Only'],
              // Veg only, delivery, home delivery, at-table and in-car dining are no longer
              // offered; their saved values (like the Sodexo MID/TID) still round-trip unchanged.
            ].map(([name, label]) => (
              <CheckboxLine
                input={
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    {...form.register(
                      name as Path<RestaurantFormValues>,
                      name === 'isOffline'
                        ? {
                            onChange: (event: { target: { checked: boolean } }) =>
                              form.setValue('isActive', !event.target.checked, {
                                shouldDirty: true,
                              }),
                          }
                        : undefined,
                    )}
                  />
                }
                key={name}
              >
                {label}
              </CheckboxLine>
            ))}
          </div>
        </div>

        {restaurantId ? (
          // Saved on its own from the panel; this form never sends staffDiscountApplicable.
          <div className="space-y-4 border-t border-ds-divider pt-6">
            <SectionHeading title="Staff Discount" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ds-muted">
                Whether staff get a discount here, and the % for each employee type.
              </p>
              <Button onClick={() => setIsStaffDiscountOpen(true)} type="button" variant="outline">
                <BadgePercent className="h-4 w-4" />
                Set rates
              </Button>
            </div>
          </div>
        ) : null}

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
            disabledReason={disabledReason}
            isPending={saveRestaurantMutation.isPending || isUploadingImages}
            label={isEditMode ? 'Update Restaurant' : 'Create Restaurant'}
          />
        </div>
      </form>
      <StaffDiscountPanel
        onClose={() => setIsStaffDiscountOpen(false)}
        restaurant={isStaffDiscountOpen ? (restaurantQuery.data ?? null) : null}
      />
    </FormShell>
  );
}

export function RestaurantCreatePageClient() {
  return <RestaurantFormPageClient />;
}

export function RestaurantEditPageClient({ restaurantId }: Readonly<{ restaurantId: string }>) {
  return <RestaurantFormPageClient restaurantId={restaurantId} />;
}
