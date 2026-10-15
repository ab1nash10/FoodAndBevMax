/**
 * A user's portal preferences, stored as JSON on users.preferences.
 *
 * Every field is optional and null means "not set": the portal then keeps its existing
 * behaviour, so a user who never opens Preferences sees no change at all.
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

export interface UserPreferences {
  /** The user's default location: their home hospital (users.hospital_id), not part of the JSON. */
  defaultLocationId: string | null;
  /** A portal path such as /inventory/grns, or null for the dashboard. */
  startPage: string | null;
  theme: ThemePreference | null;
}

/** Reads stored JSON defensively: anything malformed or unknown falls back to "not set". */
export function parsePreferences(raw: unknown): UserPreferences {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  return {
    defaultLocationId: typeof value.defaultLocationId === 'string' ? value.defaultLocationId : null,
    startPage: typeof value.startPage === 'string' ? value.startPage : null,
    theme: (THEMES as readonly unknown[]).includes(value.theme)
      ? (value.theme as ThemePreference)
      : null,
  };
}
