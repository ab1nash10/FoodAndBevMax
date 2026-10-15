'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Employee, EmployeeInput, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel, Select } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { invalidateEmployeeQueries } from '@/lib/query-invalidation';
import {
  EmployeeFormFields,
  employeeSchema,
  emptyEmployeeFormValues,
  type EmployeeFormValues,
} from '@/components/master-data/employees/shared';
import {
  ActiveFilterSelect,
  PageHeader,
  PaginationControls,
  QueryState,
  SearchInput,
  StatusBadge,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDateOnly,
  listLimit,
  optionalValue,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { useLocationContext } from '@/components/location-context';
import { MasterLocationCell, useMasterEditing } from '@/components/master-location';

type DiscountFilter = '' | 'eligible' | 'notEligible';

const timeOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
  timeStyle: 'short',
});

function discountFilterToBoolean(value: DiscountFilter): boolean | undefined {
  if (value === 'eligible') {
    return true;
  }

  if (value === 'notEligible') {
    return false;
  }

  return undefined;
}

function formatTimeOnly(value: string): string {
  return timeOnlyFormatter.format(new Date(value));
}

function employeeToFormValues(employee: Employee): EmployeeFormValues {
  return {
    department: employee.department ?? '',
    designation: employee.designation ?? '',
    eligibleForDiscount: employee.eligibleForDiscount,
    employmentType: employee.employmentType ?? '',
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    hospitalId: employee.hospitalId ?? '',
    isActive: employee.isActive,
    mobile: employee.mobile ?? '',
  };
}

type EmployeeDialog = { mode: 'create' } | { employee: Employee; mode: 'edit' };

export function EmployeesPageClient() {
  const [page, setPage] = useUrlNumberParam('page');
  // Queries and the URL wait for a pause in typing; the box updates at once.
  const [searchInput, setSearch, search] = useUrlSearchParam('q');
  const [activeFilter, setActiveFilter] = useUrlParam<ActiveFilter>('status', '', [
    'active',
    'inactive',
  ]);
  const [discountFilter, setDiscountFilter] = useState<DiscountFilter>('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  // One pop-up for create and edit.
  const [dialog, setDialog] = useState<EmployeeDialog | null>(null);
  const editingEmployee = dialog?.mode === 'edit' ? dialog.employee : null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { scopedHospitalId } = useLocationContext();
  const { canEdit, defaultHospitalId } = useMasterEditing();
  const form = useForm<EmployeeFormValues>({
    defaultValues: emptyEmployeeFormValues(defaultHospitalId),
  });

  const employeesQuery = useQuery({
    queryFn: async () => {
      const response = await organizationApi.listEmployees({
        eligibleForDiscount: discountFilterToBoolean(discountFilter),
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
    queryKey: queryKeys.employees({
      activeFilter,
      discountFilter,
      page,
      scope: scopedHospitalId ?? 'all',
      search,
      sortBy,
      sortOrder,
    }),
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

  const toggleEmployeeStatusMutation = useMutation({
    mutationFn: ({ employee, isActive }: { employee: Employee; isActive: boolean }) =>
      organizationApi.updateEmployee(employee.id, { isActive }),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: 'Employee status was not updated',
        variant: 'error',
      });
    },
    onSuccess(_response, variables) {
      invalidateEmployeeQueries(queryClient);
      showToast({
        title: variables.isActive ? 'Employee activated' : 'Employee marked inactive',
        variant: 'success',
      });
    },
  });

  function toggleEmployeeStatus(employee: Employee) {
    const nextIsActive = !employee.isActive;

    if (
      !nextIsActive &&
      !window.confirm(
        'Turning this employee inactive will stop them from being used in new operations. Existing records will remain visible. Continue?',
      )
    ) {
      return;
    }

    toggleEmployeeStatusMutation.mutate({ employee, isActive: nextIsActive });
  }

  const employees = employeesQuery.data?.items ?? [];
  const meta = employeesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  // Only the fields this reads, so typing elsewhere in the form does not re-render the page.
  const [employeeCode, employeeName] = form.watch(['employeeCode', 'employeeName']);
  const formValues = { employeeCode, employeeName };
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
      employmentType: parsed.data.employmentType || undefined,
      employeeCode: parsed.data.employeeCode,
      employeeName: parsed.data.employeeName,
      hospitalId: parsed.data.hospitalId || null,
      isActive: parsed.data.isActive,
      mobile: optionalValue(parsed.data.mobile),
    });
  });

  const hasFilters = Boolean(searchInput || activeFilter || discountFilter);

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setDiscountFilter('');
    setPage(1);
  }

  function openCreate() {
    form.reset(emptyEmployeeFormValues(defaultHospitalId));
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

  const dialogTitle = dialog?.mode === 'create' ? 'Create employee' : 'Edit employee';

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
        <ListToolbar>
          <SearchInput
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            value={searchInput}
          />
          <FiltersMenu activeCount={[activeFilter, discountFilter].filter(Boolean).length}>
            <FilterField label="Status">
              <ActiveFilterSelect
                onChange={(value) => {
                  setActiveFilter(value);
                  setPage(1);
                }}
                value={activeFilter}
              />
            </FilterField>
            <FilterField label="Discount eligibility">
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
            </FilterField>
          </FiltersMenu>
          <SortControl
            onOrderChange={(value) => {
              setSortOrder(value);
              setPage(1);
            }}
            onSortByChange={(value) => {
              setSortBy(value);
              setPage(1);
            }}
            options={[
              { label: 'Created date', value: 'createdAt' },
              { label: 'Employee name', value: 'employeeName' },
              { label: 'Employee code', value: 'employeeCode' },
              { label: 'Department', value: 'department' },
              { label: 'Designation', value: 'designation' },
              { label: 'Mobile', value: 'mobile' },
              { label: 'Discount eligible', value: 'eligibleForDiscount' },
              { label: 'Updated date', value: 'updatedAt' },
              { label: 'Status', value: 'isActive' },
            ]}
            order={sortOrder}
            sortBy={sortBy}
          />
          <RefreshButton onClick={() => void employeesQuery.refetch()} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </ListToolbar>
        <div className="overflow-x-auto">
          {/* The created date/time sits on two lines so the table stays narrow. */}
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-ds-subtle text-left">
              <tr>
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-2.5 py-2.5">Location</th>
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
                    <td className="px-2.5 py-3">
                      <MasterLocationCell hospital={employee.hospital} />
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
                      <span className="flex items-center gap-2">
                        <StatusBadge isActive={employee.isActive} />
                        <Toggle
                          ariaLabel={`${employee.employeeName} active`}
                          checked={employee.isActive}
                          disabled={toggleEmployeeStatusMutation.isPending || !canEdit(employee)}
                          onChange={() => toggleEmployeeStatus(employee)}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-3">
                      <p className="text-ds-text-3">{formatDateOnly(employee.createdAt)}</p>
                      <p className="text-xs text-ds-muted">{formatTimeOnly(employee.createdAt)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        {canEdit(employee) ? (
                          <Button
                            aria-label={`Edit ${employee.employeeName}`}
                            className="h-9 w-9"
                            onClick={() => openEdit(employee)}
                            size="icon"
                            title="Edit"
                            type="button"
                            variant="outline"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <QueryState
                  colSpan={9}
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
        }
        onClose={closeDialog}
        open={dialog !== null}
        title={dialogTitle}
      >
        {dialog ? (
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
