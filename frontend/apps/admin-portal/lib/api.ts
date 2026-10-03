import {
  ApiClientError,
  createAuthApi,
  createOrganizationApi,
  createUserApi,
} from '@aahar/api-client';
import {
  clearAaharClientStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  saveStoredAuth,
} from './auth-storage';
import { BASE_PATH } from './base-path';

// Every deployment serves the APIs from the portal's own origin under the same routing
// prefix - the ingress sends <prefix>/api/v1/* to the services. So the default is that
// relative path rather than a hard-coded host: it is correct on any hostname, needs no
// CORS, and an image built without the NEXT_PUBLIC_* args still reaches the real APIs
// instead of localhost. Local development points these at the per-service ports via .env.
const sameOriginApi = `${BASE_PATH}/api/v1`;

// `||`, not `??`: an unset --build-arg is inlined as an empty string, not as undefined, and
// an empty base URL would send every request to the origin root.
export const apiConfig = {
  authBaseUrl:
    process.env.NEXT_PUBLIC_AUTH_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || sameOriginApi,
  organizationBaseUrl: process.env.NEXT_PUBLIC_ORGANIZATION_API_URL || sameOriginApi,
  userBaseUrl: process.env.NEXT_PUBLIC_USER_API_URL || sameOriginApi,
};

export const authApi = createAuthApi({
  baseUrl: apiConfig.authBaseUrl,
});

let refreshPromise: Promise<string | null> | null = null;
let sessionExpiredHandler: ((message: string) => Promise<void> | void) | null = null;

export function setApiSessionExpiredHandler(
  handler: ((message: string) => Promise<void> | void) | null,
): void {
  sessionExpiredHandler = handler;
}

async function handleUnauthorizedSession(): Promise<void> {
  clearAaharClientStorage();
  await sessionExpiredHandler?.('Your session has expired. Please login again.');
}

export async function refreshStoredSession(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = getStoredRefreshToken();

    if (!refreshToken) {
      return null;
    }

    try {
      const response = await authApi.refresh({ refreshToken });

      saveStoredAuth(response.data);

      return response.data.accessToken;
    } catch (error) {
      // Tabs share one stored session. If another tab spent this refresh token first, it has
      // already stored the new pair: use that instead of signing every tab out.
      if (getStoredRefreshToken() !== refreshToken) {
        return getStoredAccessToken();
      }

      throw error;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export const organizationApi = createOrganizationApi({
  baseUrl: apiConfig.organizationBaseUrl,
  getAccessToken: getStoredAccessToken,
  onUnauthorized: handleUnauthorizedSession,
  refreshAccessToken: refreshStoredSession,
});

export const userApi = createUserApi({
  baseUrl: apiConfig.userBaseUrl,
  getAccessToken: getStoredAccessToken,
  onUnauthorized: handleUnauthorizedSession,
  refreshAccessToken: refreshStoredSession,
});

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return 'Unable to connect to AAHAR services. Please check your network and try again.';
    }

    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
