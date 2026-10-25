'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useToast } from '@/components/toast-provider';
import { Skeleton } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const levelLabels = { ON_ROLL: 'On roll', OUTSOURCED: 'Outsourced' } as const;

/**
 * A restaurant's staff discount switch, with its live Employee Discount rules. The rules
 * themselves (%, level, days, timings) are kept in Employee Discounts; the POS applies the best
 * one to discountable menu items for eligible employees, only while this switch is on.
 */
export function StaffDiscountPanel({
  onClose,
  restaurant,
}: Readonly<{
  onClose: () => void;
  /** The restaurant being set; null keeps the panel closed. */
  restaurant: { id: string; restaurantName: string } | null;
}>) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('RESTAURANT_UPDATE');
  const canViewRules = hasPermission('EMPLOYEE_DISCOUNT_VIEW');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [applicable, setApplicable] = useState(false);

  const settingsQuery = useQuery({
    enabled: Boolean(restaurant),
    queryFn: async () => (await organizationApi.getStaffDiscounts(restaurant!.id)).data,
    queryKey: queryKeys.staffDiscounts(restaurant?.id),
  });
  const rulesQuery = useQuery({
    enabled: Boolean(restaurant) && canViewRules,
    queryFn: async () =>
      (
        await organizationApi.listEmployeeDiscounts({
          archived: false,
          limit: 50,
          restaurantId: restaurant!.id,
        })
      ).data.items,
    queryKey: queryKeys.employeeDiscounts('restaurant', restaurant?.id),
  });

  useEffect(() => {
    if (settingsQuery.data) setApplicable(settingsQuery.data.staffDiscountApplicable);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    // The old per-type rates are sent back unchanged; Employee Discounts replaced them.
    mutationFn: () =>
      organizationApi.setStaffDiscounts(restaurant!.id, {
        rates: settingsQuery.data!.rates.map(({ discountPercent, employmentType }) => ({
          discountPercent,
          employmentType,
        })),
        staffDiscountApplicable: applicable,
      }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Staff discount was not saved',
        variant: 'error',
      });
    },
    onSuccess(response) {
      // The restaurant's own detail is left alone: refetching it would reset an open edit form.
      void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffDiscounts() });
      showToast({
        recordId: response.data.restaurantId,
        title: `Staff discount saved for ${response.data.restaurantName}`,
        variant: 'success',
      });
      onClose();
    },
  });

  const rules = rulesQuery.data ?? [];

  return (
    <Modal
      description={restaurant?.restaurantName}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose} type="button" variant="outline">
            {canEdit ? 'Cancel' : 'Close'}
          </Button>
          {canEdit ? (
            <Button
              disabled={saveMutation.isPending || !settingsQuery.data}
              onClick={() => saveMutation.mutate()}
              type="button"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          ) : null}
        </div>
      }
      onClose={onClose}
      open={restaurant !== null}
      side
      title="Staff discount"
    >
      {settingsQuery.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-control" />
          <Skeleton className="h-32" />
        </div>
      ) : settingsQuery.isError ? (
        <p className="text-sm font-medium text-ds-status-bad-fg">
          {getApiErrorMessage(settingsQuery.error)}
        </p>
      ) : (
        <div className="grid gap-5">
          <Toggle
            checked={applicable}
            disabled={!canEdit}
            label="Give staff discount at this restaurant"
            onChange={setApplicable}
          />
          {canViewRules ? (
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-ds-text">Discount rules</p>
              {rulesQuery.isLoading ? (
                <Skeleton className="h-16" />
              ) : rules.length > 0 ? (
                <ul className="divide-y divide-ds-border rounded-lg border border-ds-border">
                  {rules.map((rule) => (
                    <li className="flex items-center gap-3 px-3 py-2.5 text-sm" key={rule.id}>
                      <span className="min-w-0 flex-1 truncate font-medium text-ds-text">
                        {rule.name}
                      </span>
                      <span className="text-ds-muted">
                        {rule.employmentType ? levelLabels[rule.employmentType] : 'All staff'}
                        {rule.startTime ? ` · ${rule.startTime}–${rule.endTime}` : ''}
                      </span>
                      <span className="font-semibold tabular-nums text-ds-text">
                        {rule.discountPercent}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ds-muted">
                  No rules yet, so staff get no discount here even with the switch on.
                </p>
              )}
              <Link
                className="inline-flex items-center gap-1 text-sm font-semibold text-ds-link hover:underline"
                href={`/masters/employee-discounts?restaurant=${restaurant?.id ?? ''}`}
              >
                Manage in Employee Discounts
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
          <p className="text-sm text-ds-muted">
            Applies to menu items marked discountable, for employees marked eligible in the
            Employees master.
          </p>
        </div>
      )}
    </Modal>
  );
}
