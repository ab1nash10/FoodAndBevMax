'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, Pencil, Plus, RefreshCw, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Employee, EmployeeInput, SortOrder } from '@aahar/api-client';
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
  SortOrderSelect,
  StatusBadge,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  formatDate,
  formatDateOnly,
  listLimit,
  optionalValue,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';

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
    employeeCode: employee.employeeCode,
    employeeName: employee.employeeName,
    isActive: employee.isActive,
    mobile: employee.mobile ?? '',
  };
}

type EmployeeDialog =
  { mode: 'create' } | { employee: Employee; mode: 'edit' } | { employee: Employee; mode: 'view' };

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
    queryKey: queryKeys.employees({
      activeFilter,
      discountFilter,
      page,
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
                      <span className="flex items-center gap-2">
                        <StatusBadge isActive={employee.isActive} />
                        <Toggle
                          ariaLabel={`${employee.employeeName} active`}
                          checked={employee.isActive}
                          disabled={toggleEmployeeStatusMutation.isPending}
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
