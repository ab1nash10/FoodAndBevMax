'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Employee, EmployeeInput, SortOrder } from '@aahar/api-client';
import { ClearFiltersButton } from '@/components/clear-filters-button';
import { ImportButton } from '@/components/import/import-dialog';
import { employeeImport } from '@/components/import/import-definitions';
import {
  FilterField,
  FiltersMenu,
  ListToolbar,
  RefreshButton,
  SortControl,
} from '@/components/list-toolbar';
import {
  AppPageHeader,
  DateTimeCell,
  RowAction,
  StatStrip,
  tableStyles,
} from '@/components/design-system';
import { useToast } from '@/components/toast-provider';
import { Badge, Panel, Select } from '@/components/ui';
import { Modal, Toggle } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi } from '@/lib/api';
import { useUrlNumberParam, useUrlParam, useUrlSearchParam } from '@/lib/use-url-state';
import { useUndoable } from '@/lib/use-undoable';
import { invalidateEmployeeQueries } from '@/lib/query-invalidation';
import {
  EmployeeFormFields,
  employeeSchema,
  emptyEmployeeFormValues,
  type EmployeeFormValues,
} from '@/components/master-data/employees/shared';
import {
  ActiveFilterSelect,
  PaginationControls,
  QueryState,
  SearchInput,
} from '@/components/master-data/shared/components';
import type { ActiveFilter } from '@/components/master-data/shared/types';
import {
  activeFilterToBoolean,
  applyValidationErrors,
  listLimit,
  optionalValue,
} from '@/components/master-data/shared/utils';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useLocationContext } from '@/components/location-context';
import { MasterLocationCell, useMasterEditing } from '@/components/master-location';

const requiredFields = employeeSchema.pick({ employeeCode: true, employeeName: true });

type DiscountFilter = '' | 'eligible' | 'notEligible';

function discountFilterToBoolean(value: DiscountFilter): boolean | undefined {
  if (value === 'eligible') {
    return true;
  }

  if (value === 'notEligible') {
    return false;
  }

  return undefined;
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

  // Under the list's own key, so whatever refreshes the list refreshes these counts too.
  const statsQuery = useQuery({
    queryFn: async () => {
      const count = async (query: { eligibleForDiscount?: boolean; isActive?: boolean }) =>
        (
          await organizationApi.listEmployees({
            ...query,
            hospitalId: scopedHospitalId,
            limit: 0,
          })
        ).data.meta.total;
      const [all, active, eligible, inactive] = await Promise.all([
        count({}),
        count({ isActive: true }),
        count({ eligibleForDiscount: true }),
        count({ isActive: false }),
      ]);

      return { active, all, eligible, inactive };
    },
    queryKey: queryKeys.employees('stats', scopedHospitalId ?? 'all'),
  });
  const stats = statsQuery.data;

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
      // Marking inactive already had its Undo toast.
      if (variables.isActive) showToast({ title: 'Employee activated', variant: 'success' });
    },
  });
  const undoable = useUndoable();

  function toggleEmployeeStatus(employee: Employee) {
    // Switching it back on while the Undo toast runs is the same as Undo.
    if (undoable.undo(employee.id)) return;

    if (employee.isActive) {
      undoable.schedule({
        commit: () => toggleEmployeeStatusMutation.mutateAsync({ employee, isActive: false }),
        description: 'They can’t be used in new operations. Existing records stay visible.',
        id: employee.id,
        title: `${employee.employeeName} marked inactive`,
      });
      return;
    }

    toggleEmployeeStatusMutation.mutate({ employee, isActive: true });
  }

  // An employee marked inactive shows so at once, while its Undo toast runs.
  const employees = (employeesQuery.data?.items ?? []).map((employee) =>
    undoable.isChanged(employee.id) ? { ...employee, isActive: false } : employee,
  );
  const meta = employeesQuery.data?.meta ?? {
    limit: listLimit,
    page,
    total: 0,
    totalPages: 1,
  };
  // Only the fields this reads, so typing elsewhere in the form does not re-render the page.
  const [employeeCode, employeeName] = form.watch(['employeeCode', 'employeeName']);
  // The first required field still missing, in the schema's own words.
  const disabledReason = requiredFields.safeParse({ employeeCode, employeeName }).error?.issues[0]
    ?.message;

  const handleSubmit = form.handleSubmit((values) => {
    const parsed = employeeSchema.safeParse(values);

    if (!parsed.success) {
      applyValidationErrors(form, parsed.error);
      return;
    }

    // Blank optional fields are sent as null, so an edit can clear them.
    saveEmployeeMutation.mutate({
      department: optionalValue(parsed.data.department) ?? null,
      designation: optionalValue(parsed.data.designation) ?? null,
      eligibleForDiscount: parsed.data.eligibleForDiscount,
      employmentType: parsed.data.employmentType || undefined,
      employeeCode: parsed.data.employeeCode,
      employeeName: parsed.data.employeeName,
      hospitalId: parsed.data.hospitalId || null,
      isActive: parsed.data.isActive,
      mobile: optionalValue(parsed.data.mobile) ?? null,
    });
  });

  const hasFilters = Boolean(searchInput || activeFilter || discountFilter);

  function clearFilters() {
    setSearch('');
    setActiveFilter('');
    setDiscountFilter('');
    setPage(1);
  }

  /** A stat's filter alone: the status or discount eligibility, the other cleared. */
  function showOnly(status: ActiveFilter, discount: DiscountFilter) {
    setActiveFilter(status);
    setDiscountFilter(discount);
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
      <AppPageHeader
        action={
          <>
            <ImportButton definition={employeeImport} />
            <Button onClick={openCreate} type="button">
              <Plus className="h-4 w-4" />
              New employee
            </Button>
          </>
        }
        count={stats?.all}
        description="Maintain employee records for future staff discount validation."
        title="Employees"
      />
      <StatStrip
        label="Employees at a glance"
        stats={[
          {
            active: !activeFilter && !discountFilter,
            label: 'All employees',
            onSelect: () => showOnly('', ''),
            value: stats?.all ?? '–',
          },
          {
            active: activeFilter === 'active' && !discountFilter,
            label: 'Active',
            onSelect: () => showOnly('active', ''),
            tone: 'ok',
            value: stats?.active ?? '–',
          },
          {
            active: discountFilter === 'eligible' && !activeFilter,
            label: 'Discount eligible',
            onSelect: () => showOnly('', 'eligible'),
            value: stats?.eligible ?? '–',
          },
          {
            active: activeFilter === 'inactive' && !discountFilter,
            label: 'Inactive',
            onSelect: () => showOnly('inactive', ''),
            tone: 'pending',
            value: stats?.inactive ?? '–',
          },
        ]}
      />

      <Panel className="overflow-hidden">
        <ListToolbar>
          <SearchInput
            label="Search employees"
            placeholder="Name, code, mobile or department"
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
          <table className={cn(tableStyles.table, 'min-w-200')}>
            <thead className={tableStyles.head}>
              <tr>
                <th className={tableStyles.th}>Employee</th>
                <th className={tableStyles.th}>Location</th>
                <th className={tableStyles.th}>Department</th>
                <th className={tableStyles.th}>Designation</th>
                <th className={tableStyles.th}>Mobile</th>
                <th className={tableStyles.th}>Discount</th>
                <th className={tableStyles.th}>Status</th>
                <th className={tableStyles.th}>Created</th>
                <th className={cn(tableStyles.th, 'w-14')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((employee) => {
                  const editable = canEdit(employee);

                  return (
                    <tr
                      className={cn(tableStyles.row, !editable && 'cursor-default')}
                      key={employee.id}
                      onClick={editable ? () => openEdit(employee) : undefined}
                    >
                      <td className={tableStyles.td}>
                        <p className={tableStyles.title}>{employee.employeeName}</p>
                        <p className={tableStyles.code}>{employee.employeeCode}</p>
                      </td>
                      <td className={tableStyles.td}>
                        <MasterLocationCell hospital={employee.hospital} />
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {employee.department || 'Not set'}
                      </td>
                      <td className={cn(tableStyles.td, 'text-ds-text-2')}>
                        {employee.designation || 'Not set'}
                      </td>
                      <td
                        className={cn(
                          tableStyles.td,
                          employee.mobile && tableStyles.num,
                          'whitespace-nowrap text-ds-text-2',
                        )}
                      >
                        {employee.mobile || 'Not set'}
                      </td>
                      <td className={tableStyles.td}>
                        <Badge variant={employee.eligibleForDiscount ? 'success' : 'neutral'}>
                          {employee.eligibleForDiscount ? 'Eligible' : 'Not eligible'}
                        </Badge>
                      </td>
                      {/* Its own click: switching the status does not open the employee. */}
                      <td className={tableStyles.td} onClick={(event) => event.stopPropagation()}>
                        <span className="flex items-center gap-2">
                          <Toggle
                            ariaLabel={`${employee.employeeName} active`}
                            checked={employee.isActive}
                            disabled={toggleEmployeeStatusMutation.isPending || !editable}
                            onChange={() => toggleEmployeeStatus(employee)}
                          />
                          <span
                            className={cn(
                              'text-xs font-bold',
                              employee.isActive ? 'text-ds-status-ok-fg' : 'text-ds-muted',
                            )}
                          >
                            {employee.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </td>
                      <td className={tableStyles.td}>
                        <DateTimeCell value={employee.createdAt} />
                      </td>
                      <td className={cn(tableStyles.td, 'pr-3')}>
                        <span className="flex justify-end">
                          {editable ? (
                            <RowAction
                              icon={Pencil}
                              label={`Edit ${employee.employeeName}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openEdit(employee);
                              }}
                            />
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })
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
        side
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={closeDialog} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              aria-describedby={disabledReason ? 'employee-form-reason' : undefined}
              disabled={Boolean(disabledReason) || saveEmployeeMutation.isPending}
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
            {/* Above the buttons on a phone, left of them on a wider screen. */}
            {disabledReason ? (
              <p
                className="text-sm text-ds-muted sm:order-first sm:self-center"
                id="employee-form-reason"
              >
                {disabledReason}
              </p>
            ) : null}
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
