'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessRole, AccessUser, AccessUserInput } from '@aahar/api-client';
import { Loader2, MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { LocationPickerDialog } from '@/components/access/location-picker-dialog';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { PasswordInput } from '@/components/ui-controls';
import { getApiErrorMessage, organizationApi, userApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /(?=.*[A-Za-z])(?=.*\d).{8,}/;

interface FormValues {
  designation: string;
  email: string;
  employeeCode: string;
  isActive: boolean;
  mobile: string;
  name: string;
  password: string;
  roleId: string;
}

function toFormValues(user: AccessUser | null): FormValues {
  return {
    designation: user?.designation ?? '',
    email: user?.email ?? '',
    employeeCode: user?.employeeCode ?? '',
    isActive: user ? user.status === 'ACTIVE' : true,
    mobile: user?.mobile ?? '',
    name: user?.name ?? '',
    password: '',
    roleId: user?.roles[0]?.id ?? '',
  };
}

function Toggle({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: (value: boolean) => void }>) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="relative inline-flex">
        <input
          checked={checked}
          className="peer sr-only"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span className="h-6 w-11 rounded-full bg-ds-input transition peer-checked:bg-ds-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ds-primary peer-focus-visible:ring-offset-2" />
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
      <span className="text-sm font-medium text-ds-text-2">{label}</span>
    </label>
  );
}

export function UserDialog({
  onClose,
  roles,
  user,
}: Readonly<{ onClose: () => void; roles: AccessRole[]; user: AccessUser | null }>) {
  const [values, setValues] = useState<FormValues>(() => toFormValues(user));
  const [homeId, setHomeId] = useState(() => user?.hospitals[0]?.id ?? '');
  const [accessIds, setAccessIds] = useState<string[]>(
    () => user?.hospitals.map((hospital) => hospital.id) ?? [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const selectedRole = roles.find((role) => role.id === values.roleId);
  const scope = selectedRole?.locationScope;
  const isSingle = scope === 'SINGLE';
  // Only an ALL-scope role makes location selection meaningless. With no role chosen yet the
  // controls stay usable, so locations can be picked in any order; submit does the validating.
  const canPickLocations = scope !== 'ALL';

  // Only the assigned locations are fetched by name; the full list lives in the picker dialog.
  const hospitalsQuery = useQuery({
    queryFn: async () => (await organizationApi.listHospitals({ limit: 100, page: 1 })).data,
    queryKey: queryKeys.accessHospitals(),
  });
  const hospitals = hospitalsQuery.data?.items ?? [];
  const nameOf = (id: string) =>
    hospitals.find((hospital) => hospital.id === id)?.hospitalName ??
    user?.hospitals.find((hospital) => hospital.id === id)?.name ??
    id;

  const saveMutation = useMutation({
    mutationFn: (body: AccessUserInput | Partial<AccessUserInput>) =>
      user ? userApi.updateUser(user.id, body) : userApi.createUser(body as AccessUserInput),
    onError(error) {
      showToast({
        description: getApiErrorMessage(error),
        title: user ? 'User was not updated' : 'User was not created',
        variant: 'error',
      });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: queryKeys.accessUsers() });
      showToast({ title: user ? 'User updated' : 'User created', variant: 'success' });
      onClose();
    },
  });

  const update = <K extends keyof FormValues>(name: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [name]: value }));

  const chooseHome = (id: string) => {
    setHomeId(id);
    // A single-location role holds exactly its home; otherwise the home must be inside the set.
    setAccessIds((current) =>
      isSingle ? (id ? [id] : []) : current.includes(id) || !id ? current : [...current, id],
    );
  };

  function submit() {
    if (
      !values.name.trim() ||
      !values.mobile.match(/^\d{10}$/) ||
      !values.roleId ||
      !emailPattern.test(values.email.trim()) ||
      (!user && !values.employeeCode.trim())
    ) {
      showToast({
        description: 'Enter a name, 10-digit mobile number, email, code, and role.',
        title: 'Complete the required fields',
        variant: 'error',
      });
      return;
    }

    // Home first: the API treats the first location as the user's home posting.
    const hospitalIds = homeId
      ? [homeId, ...accessIds.filter((id) => id !== homeId)]
      : [...accessIds];

    if (isSingle && hospitalIds.length !== 1) {
      showToast({
        description: `The ${selectedRole?.name} role works at one location, so select exactly one.`,
        title: 'Select a location',
        variant: 'error',
      });
      return;
    }
    if (scope === 'MULTI' && hospitalIds.length === 0) {
      showToast({
        description: `The ${selectedRole?.name} role needs at least one location.`,
        title: 'Select a location',
        variant: 'error',
      });
      return;
    }
    if ((!user || values.password) && !passwordPattern.test(values.password)) {
      showToast({
        description: 'Password must be at least 8 characters and include a letter and a number.',
        title: 'Check the password',
        variant: 'error',
      });
      return;
    }

    // No avatarUrl: the field was removed from this dialog, and leaving it out means an edit
    // keeps whatever avatar a user already has.
    const payload: AccessUserInput = {
      designation: values.designation.trim() || undefined,
      email: values.email.trim().toLowerCase(),
      employeeCode: values.employeeCode.trim(),
      hospitalIds,
      mobile: values.mobile,
      name: values.name.trim(),
      password: values.password,
      roleId: values.roleId,
      status: values.isActive ? 'ACTIVE' : 'DISABLED',
    };

    if (user) {
      const { employeeCode: _employeeCode, ...rest } = payload;
      saveMutation.mutate(values.password ? rest : { ...rest, password: undefined });
      return;
    }

    saveMutation.mutate(payload);
  }

  return (
    <>
      <div
        aria-label={user ? 'Edit user' : 'Add user'}
        aria-modal="true"
        className="fixed inset-0 z-40 flex items-center justify-center bg-ds-overlay p-4"
        role="dialog"
      >
        <Panel className="flex max-h-[88vh] w-full max-w-lg flex-col p-0">
          <div className="flex items-center justify-between border-b border-ds-border px-5 py-3">
            <h2 className="text-base font-semibold text-ds-text">Add/Edit User</h2>
            <Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field label="Name" name="name">
              <Input
                id="name"
                onChange={(event) => update('name', event.target.value)}
                placeholder="Name"
                value={values.name}
              />
            </Field>

            <Field label="Email" name="email">
              <Input
                id="email"
                onChange={(event) => update('email', event.target.value)}
                placeholder="Email"
                type="email"
                value={values.email}
              />
            </Field>

            <Field label="Employee Code" name="employeeCode">
              <Input
                disabled={Boolean(user)}
                id="employeeCode"
                onChange={(event) => update('employeeCode', event.target.value)}
                placeholder="Employee Code"
                value={values.employeeCode}
              />
            </Field>

            <Field label="Mobile" name="mobile">
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-ds-border bg-ds-subtle px-3 text-sm text-ds-muted">
                  +91
                </span>
                <Input
                  className="rounded-l-none"
                  id="mobile"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => update('mobile', event.target.value.replace(/\D/g, ''))}
                  value={values.mobile}
                />
              </div>
            </Field>

            <Field label="Designation" name="designation">
              <Input
                id="designation"
                onChange={(event) => update('designation', event.target.value)}
                value={values.designation}
              />
            </Field>

            <Field label="Role" name="roleId">
              <Select
                id="roleId"
                onChange={(event) => {
                  update('roleId', event.target.value);
                  const next = roles.find((role) => role.id === event.target.value);
                  // Switching to a single-location role trims the set back to the home location.
                  if (next?.locationScope === 'SINGLE') setAccessIds(homeId ? [homeId] : []);
                }}
                value={values.roleId}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={user ? 'Password (leave blank to keep)' : 'Password'} name="password">
              {/*
                Browsers autofill saved credentials into any password box, which on an edit would
                silently replace that user's password. They skip read-only fields, so the field
                opens read-only and unlocks on focus.
              */}
              <PasswordInput
                autoComplete="new-password"
                id="password"
                onChange={(event) => update('password', event.target.value)}
                onFocus={(event) => {
                  event.target.readOnly = false;
                }}
                placeholder="Min 8 chars, 1 letter and 1 number"
                readOnly
                value={values.password}
              />
            </Field>

            <Field label="Location" name="location">
              <Select
                disabled={!canPickLocations}
                id="location"
                onChange={(event) => chooseHome(event.target.value)}
                value={homeId}
              >
                <option value="">
                  {canPickLocations ? 'No Location Selected' : 'All locations (by role)'}
                </option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.hospitalCode} - {hospital.hospitalName}
                  </option>
                ))}
              </Select>
            </Field>

            <Toggle
              checked={values.isActive}
              label="Active"
              onChange={(value) => update('isActive', value)}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-ds-text-2">Location(s) Access</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canPickLocations}
                  onClick={() => setPickerOpen(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <MapPin className="h-4 w-4" />
                  Add Location(s)
                </Button>
                <Button
                  disabled={accessIds.length === 0}
                  onClick={() => {
                    setAccessIds([]);
                    setHomeId('');
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Clear All
                </Button>
              </div>

              {scope === 'ALL' ? (
                <p className="mt-2 text-xs text-ds-muted">
                  {selectedRole?.name} reaches every location, so no assignment is needed.
                </p>
              ) : accessIds.length === 0 ? (
                <p className="mt-2 text-xs text-ds-muted">No locations added yet.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {accessIds.map((id) => (
                    <li
                      className="flex items-center gap-1 rounded-full bg-ds-teal-soft px-3 py-1 text-xs font-medium text-ds-teal-text"
                      key={id}
                    >
                      {nameOf(id)}
                      {id === homeId ? <span className="opacity-70">(home)</span> : null}
                      <button
                        aria-label={`Remove ${nameOf(id)}`}
                        onClick={() => {
                          setAccessIds((current) => current.filter((value) => value !== id));
                          if (id === homeId) setHomeId('');
                        }}
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-ds-border px-5 py-3">
            <Button
              disabled={saveMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={saveMutation.isPending} onClick={submit} type="button">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
          </div>
        </Panel>
      </div>

      {pickerOpen ? (
        <LocationPickerDialog
          onCancel={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setAccessIds(ids);
            if (!ids.includes(homeId)) setHomeId(ids[0] ?? '');
            setPickerOpen(false);
          }}
          selectedIds={accessIds}
          singleSelect={isSingle}
        />
      ) : null}
    </>
  );
}
