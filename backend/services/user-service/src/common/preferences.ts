/**
 * A user's portal preferences, stored as JSON on users.preferences.
 *
 * Every field is optional and null means "not set": the portal then keeps its existing
 * behaviour, so a user who never opens Preferences sees no change at all.
 */
export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEMES)[number];

/**
 * Notification categories a user may mute. ACCESS is deliberately not in the list: a change to
 * your own role, locations or permissions must always reach you.
 */
export const MUTABLE_NOTIFICATION_CATEGORIES = ['GRN', 'KITCHEN', 'TRANSFER'] as const;

export interface UserPreferences {
  /** "all", a hospital id, or null for the portal's usual default. */
  defaultLocationId: string | null;
  mutedNotificationCategories: string[];
  /** A portal path such as /inventory/grns, or null for the dashboard. */
  startPage: string | null;
  theme: ThemePreference | null;
}

/** Reads stored JSON defensively: anything malformed or unknown falls back to "not set". */
export function parsePreferences(raw: unknown): UserPreferences {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mutable = MUTABLE_NOTIFICATION_CATEGORIES as readonly string[];

  return {
    defaultLocationId: typeof value.defaultLocationId === 'string' ? value.defaultLocationId : null,
    mutedNotificationCategories: Array.isArray(value.mutedNotificationCategories)
      ? value.mutedNotificationCategories.filter(
          (category): category is string =>
            typeof category === 'string' && mutable.includes(category),
        )
      : [],
    startPage: typeof value.startPage === 'string' ? value.startPage : null,
    theme: (THEMES as readonly unknown[]).includes(value.theme)
      ? (value.theme as ThemePreference)
      : null,
  };
}
