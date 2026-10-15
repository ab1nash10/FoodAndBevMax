import { userApi } from '@/lib/api';
import { getStartPageOptions } from '@/lib/navigation';
import { sessionUserFromAccessToken } from '@/lib/session';

/**
 * Where to go after signing in: the user's chosen start page if it is one they may open.
 * Anything unexpected - no preference, a slow or failed request, a since-revoked permission -
 * means the dashboard, exactly as before Preferences existed.
 */
export async function startPageAfterSignIn(accessToken: string): Promise<string> {
  try {
    const preferences = await Promise.race([
      userApi.getMyPreferences().then((response) => response.data),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    const permissions = sessionUserFromAccessToken(accessToken)?.permissions ?? [];
    const hasPermission = (permission: string | string[]) =>
      (Array.isArray(permission) ? permission : [permission]).some((code) =>
        permissions.includes(code),
      );
    const startPage = preferences?.startPage;

    if (startPage && getStartPageOptions(hasPermission).some((page) => page.href === startPage)) {
      return startPage;
    }
  } catch {
    // The dashboard it is.
  }

  return '/dashboard';
}
