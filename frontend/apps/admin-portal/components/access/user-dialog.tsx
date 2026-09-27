'use client';

import { Button } from '@aahar/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessRole, AccessUser, AccessUserInput } from '@aahar/api-client';
import { Loader2, MapPin, Upload, X } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { LocationPickerDialog } from '@/components/access/location-picker-dialog';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Panel, Select } from '@/components/ui';
import { getApiErrorMessage, organizationApi, userApi } from '@/lib/api';
import { withBasePath } from '@/lib/base-path';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /(?=.*[A-Za-z])(?=.*\d).{8,}/;

interface FormValues {
  avatarUrl: string;
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
    avatarUrl: user?.avatarUrl ?? '',
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

async function uploadAvatar(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);

  // withBasePath: Next's basePath does not apply to a raw fetch.
  const response = await fetch(withBasePath('/api/uploads/avatars'), { body, method: 'POST' });
  const payload = (await response.json()) as { message?: string; url?: string };

  if (!response.ok || !payload.url) {
    throw new Error(payload.message ?? 'The avatar could not be uploaded.');
  }

  return payload.url;
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
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-teal peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal peer-focus-visible:ring-offset-2 dark:bg-slate-700" />
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
      </span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
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
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
    queryKey: ['access-hospitals'],
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
      void queryClient.invalidateQueries({ queryKey: ['access-users'] });
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

  async function onAvatarPicked(file: File) {
    setIsUploading(true);
    try {
      update('avatarUrl', await uploadAvatar(file));
    } catch (error) {
      showToast({
        description: error instanceof Error ? error.message : 'Upload failed.',
        title: 'Avatar was not uploaded',
        variant: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  }

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

    const payload: AccessUserInput = {
      avatarUrl: values.avatarUrl || undefined,
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
        className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4"
        role="dialog"
      >
        <Panel className="flex max-h-[88vh] w-full max-w-lg flex-col p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
              Add/Edit User
            </h2>
            <Button aria-label="Close" onClick={onClose} size="icon" type="button" variant="ghost">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <Field label="Avatar" name="avatar">
              <div className="flex items-center gap-3">
                {values.avatarUrl ? (
                  <Image
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                    height={48}
                    src={withBasePath(values.avatarUrl)}
                    width={48}
                  />
                ) : (
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
                    <Upload className="h-4 w-4" />
                  </span>
                )}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onAvatarPicked(file);
                  }}
                  ref={fileRef}
                  type="file"
                />
                <Button
                  disabled={isUploading}
                  onClick={() => fileRef.current?.click()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Choose
                </Button>
                {values.avatarUrl ? (
                  <Button
                    onClick={() => update('avatarUrl', '')}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </Field>

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
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
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
              <Input
                autoComplete="new-password"
                id="password"
                onChange={(event) => update('password', event.target.value)}
                onFocus={(event) => {
                  event.target.readOnly = false;
                }}
                placeholder="Min 8 chars, 1 letter and 1 number"
                readOnly
                type="password"
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
              <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                Location(s) Access
              </p>
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
                <p className="mt-2 text-xs text-slate-500">
                  {selectedRole?.name} reaches every location, so no assignment is needed.
                </p>
              ) : accessIds.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No locations added yet.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {accessIds.map((id) => (
                    <li
                      className="flex items-center gap-1 rounded-full bg-brand-mint px-3 py-1 text-xs font-medium text-brand-teal"
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

          <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
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
