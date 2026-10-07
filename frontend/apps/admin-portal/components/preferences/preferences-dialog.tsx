'use client';

import type { ThemePreference, UserPreferences, UserPreferencesInput } from '@aahar/api-client';
import { Button } from '@aahar/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Monitor, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getStartPageOptions } from '@/lib/navigation';
import { useAuth } from '@/components/auth-provider';
import { FormSection, LoadingSkeleton } from '@/components/design-system';
import { formatGlobalLocationLabel, useLocationContext } from '@/components/location-context';
import { useTheme } from '@/components/theme-provider';
import { useToast } from '@/components/toast-provider';
import { Field, Input, Select } from '@/components/ui';
import { Modal } from '@/components/ui-controls';
import { getApiErrorMessage, userApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { preferencesQueryKey, usePreferences, useSavePreferences } from './use-preferences';

const themeOptions: Array<{ icon: typeof Sun; label: string; value: ThemePreference }> = [
  { icon: Sun, label: 'Light', value: 'light' },
  { icon: Moon, label: 'Dark', value: 'dark' },
  { icon: Monitor, label: 'Match system', value: 'system' },
];

// ACCESS is not listed: changes to your own access are always shown.
const notificationOptions = [
  { description: 'When goods are received into a store', label: 'GRNs', value: 'GRN' },
  {
    description: 'Store and kitchen transfers to restaurants',
    label: 'Transfers',
    value: 'TRANSFER',
  },
  { description: 'Kitchen production updates', label: 'Kitchen', value: 'KITCHEN' },
];

const passwordPattern = /(?=.*[A-Za-z])(?=.*\d).{8,}/;

/** Personal settings, opened from the profile menu. Mounted only while open, so it starts fresh. */
export function PreferencesDialog({ onClose }: Readonly<{ onClose: () => void }>) {
  const { currentUser, hasPermission } = useAuth();
  const { availableLocations, canSelectAllLocations } = useLocationContext();
  const { setTheme, theme } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const preferencesQuery = usePreferences();
  const savePreferences = useSavePreferences();
  const startPages = useMemo(() => getStartPageOptions(hasPermission), [hasPermission]);
  // What the controls show. Kept in component state, so a click updates the control in the same
  // render; via the query cache alone the update lands a tick later and React briefly snaps the
  // control back to its old value.
  const [draft, setDraft] = useState<UserPreferences | null>(null);
  const preferences = draft ?? preferencesQuery.data;

  // Every control saves as soon as it changes, and rolls back if the save fails, so the page
  // never keeps showing a value that was not stored.
  const save = (patch: UserPreferencesInput) => {
    const previous = preferences;

    if (previous) {
      setDraft({ ...previous, ...patch });
    }

    savePreferences.mutate(patch, {
      onError(error) {
        setDraft(previous ?? null);
        if (previous) {
          queryClient.setQueryData(preferencesQueryKey, previous);
        }
        showToast({
          description: getApiErrorMessage(error),
          title: 'Preferences were not saved',
          variant: 'error',
        });
      },
      onSuccess() {
        showToast({ title: 'Preferences saved', variant: 'success' });
      },
    });
  };

  const locationChoices = [
    ...(canSelectAllLocations ? [{ label: 'All Locations', value: 'all' }] : []),
    ...availableLocations.map((location) => ({
      label: formatGlobalLocationLabel(location),
      value: location.id,
    })),
  ];

  return (
    <Modal onClose={onClose} open title="Preferences">
      {preferencesQuery.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : preferencesQuery.isError || !preferences ? (
        <FormSection title="Preferences could not be loaded">
          <p className="text-sm text-ds-text-3">{getApiErrorMessage(preferencesQuery.error)}</p>
          <Button
            className="mt-4"
            onClick={() => void preferencesQuery.refetch()}
            variant="outline"
          >
            Try again
          </Button>
        </FormSection>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-ds-muted">
            Saved to your account, so they follow you on every device you sign in to.
          </p>
          <FormSection description="How the portal looks on your screens." title="Appearance">
            <div aria-label="Theme" className="grid gap-2 sm:grid-cols-3" role="group">
              {themeOptions.map((option) => {
                const selected = (preferences.theme ?? theme) === option.value;

                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                      selected
                        ? 'border-ds-primary bg-ds-primary-soft text-ds-link'
                        : 'border-ds-border text-ds-text-3 hover:bg-ds-subtle',
                    )}
                    key={option.value}
                    onClick={() => {
                      setTheme(option.value);
                      save({ theme: option.value });
                    }}
                    type="button"
                  >
                    <option.icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </FormSection>

          <FormSection description="Where the portal takes you when you sign in." title="Workspace">
            <div className="grid gap-4">
              <Field label="Start page" name="start-page">
                <Select
                  id="start-page"
                  onChange={(event) =>
                    save({
                      startPage:
                        event.target.value === '/dashboard' ? null : event.target.value || null,
                    })
                  }
                  value={preferences.startPage ?? '/dashboard'}
                >
                  {startPages.map((page) => (
                    <option key={page.href} value={page.href}>
                      {page.group === 'Overview' ? page.label : `${page.group} - ${page.label}`}
                      {page.href === '/dashboard' ? ' (default)' : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              {locationChoices.length > 1 ? (
                <Field label="Default location" name="default-location">
                  <Select
                    id="default-location"
                    onChange={(event) => save({ defaultLocationId: event.target.value || null })}
                    value={preferences.defaultLocationId ?? ''}
                  >
                    <option value="">Usual default</option>
                    {locationChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <p className="text-sm text-ds-muted">
                  You work at a single location, so the portal always opens there.
                </p>
              )}
              <p className="text-xs text-ds-muted">
                Applied each time you sign in. You can still switch location from the header.
              </p>
            </div>
          </FormSection>

          <FormSection description="Choose which updates appear in the bell." title="Notifications">
            <div className="grid gap-3">
              {notificationOptions.map((option) => {
                const shown = !preferences.mutedNotificationCategories.includes(option.value);

                return (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-ds-border p-3"
                    key={option.value}
                  >
                    <input
                      checked={shown}
                      className="mt-0.5 h-4 w-4"
                      onChange={() =>
                        save({
                          mutedNotificationCategories: shown
                            ? [...preferences.mutedNotificationCategories, option.value]
                            : preferences.mutedNotificationCategories.filter(
                                (category) => category !== option.value,
                              ),
                        })
                      }
                      type="checkbox"
                    />
                    <span>
                      <span className="block text-sm font-medium text-ds-text dark:text-white">
                        {option.label}
                      </span>
                      <span className="block text-xs text-ds-muted">{option.description}</span>
                    </span>
                  </label>
                );
              })}
              <p className="text-xs text-ds-muted">Changes to your own access are always shown.</p>
            </div>
          </FormSection>

          <FormSection description="The password for signing in with your email." title="Security">
            {currentUser?.email ? (
              <ChangePasswordForm email={currentUser.email} />
            ) : (
              <p className="text-sm text-ds-muted">
                Your account signs in with a mobile OTP, so there is no password to change.
              </p>
            )}
          </FormSection>
        </div>
      )}
    </Modal>
  );
}

function ChangePasswordForm({ email }: Readonly<{ email: string }>) {
  const { logout } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const changePassword = useMutation({
    mutationFn: () => userApi.changeMyPassword({ currentPassword, newPassword }),
    onError(mutationError) {
      setError(getApiErrorMessage(mutationError));
    },
    // The server has ended every session of this user, so sign out here too, as the profile
    // menu's sign-out does, and let them sign in again with the new password.
    onSuccess() {
      showToast({
        description: 'Sign in again with your new password.',
        title: 'Password changed',
        variant: 'success',
      });
      void logout().then(() => router.replace('/auth/login'));
    },
  });

  const submit = () => {
    if (!currentPassword) {
      setError('Enter your current password.');
    } else if (!passwordPattern.test(newPassword)) {
      setError('New password must be at least 8 characters and include a letter and a number.');
    } else if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
    } else {
      setError(null);
      changePassword.mutate();
    }
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-ds-muted">
        Signed in as <span className="font-medium text-ds-text-2">{email}</span>
      </p>
      <Field label="Current password" name="current-password">
        <Input
          autoComplete="current-password"
          id="current-password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          type="password"
          value={currentPassword}
        />
      </Field>
      <Field label="New password" name="new-password">
        <Input
          autoComplete="new-password"
          id="new-password"
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Min 8 chars, 1 letter and 1 number"
          type="password"
          value={newPassword}
        />
      </Field>
      <Field error={error ?? undefined} label="Confirm new password" name="confirm-password">
        <Input
          autoComplete="new-password"
          id="confirm-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          value={confirmPassword}
        />
      </Field>
      <div>
        <Button disabled={changePassword.isPending} type="submit">
          {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Change password
        </Button>
      </div>
    </form>
  );
}
