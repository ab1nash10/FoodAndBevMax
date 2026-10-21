import {
  createApiClient,
  type ApiClientOptions,
  type ApiList,
  type ApiResponse,
  type ListQuery,
} from './http';
import type { HospitalSummary } from './organization';

export type UserStatus = 'ACTIVE' | 'DISABLED';

export type LocationScope = 'ALL' | 'MULTI' | 'SINGLE';

export interface AccessRole {
  description: string | null;
  id: string;
  /** ALL = every location, MULTI = the assigned locations, SINGLE = exactly one. */
  locationScope: LocationScope;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface AccessUser {
  avatarUrl: string | null;
  createdAt: string;
  /** While set (ISO time), an admin cannot change this user's email, mobile or password. */
  credentialsLockedUntil: string | null;
  /** Where the user starts after sign-in: one of their locations (any location for ALL scope). */
  defaultLocationId: string | null;
  designation: string | null;
  email: string | null;
  employeeCode: string;
  hospitals: Array<{ id: string; name: string }>;
  id: string;
  locationScope: LocationScope | null;
  mobile: string;
  name: string;
  roles: AccessRole[];
  status: UserStatus;
  updatedAt: string;
}

export interface AccessUserInput {
  avatarUrl?: string;
  /** Required when changing your own password, email or mobile. */
  currentPassword?: string;
  /** Null on an update clears it. */
  designation?: string | null;
  /** A password signs in with the email, so every user has one. */
  email: string;
  employeeCode: string;
  /** Locations this user may operate in; count must match the role's locationScope. */
  hospitalIds?: string[];
  mobile: string;
  name: string;
  /** Required on create; omit on update to keep the existing password. */
  password?: string;
  roleId: string;
  status?: UserStatus;
}

export type ThemePreference = 'dark' | 'light' | 'system';

/** Unset fields are null: the portal then keeps its usual behaviour. */
export interface UserPreferences {
  /** The user's default location (their home location); null only if none is set yet. */
  defaultLocationId: string | null;
  /** A portal path such as /inventory/grns, or null for the dashboard. */
  startPage: string | null;
  theme: ThemePreference | null;
}

/**
 * Partial update: omitted fields are kept, null resets a field to its default. The default
 * location can be changed to another of the user's locations but never cleared.
 */
export type UserPreferencesInput = Partial<Omit<UserPreferences, 'defaultLocationId'>> & {
  defaultLocationId?: string;
};

/** The signed-in user's location reach, default location and the active locations they may pick. */
export interface MyAccess {
  defaultLocationId: string | null;
  locationScope: LocationScope;
  locations: HospitalSummary[];
  /** The signed-in user's permissions, as the server resolves them now. */
  permissions: string[];
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AccessUserListQuery extends ListQuery {
  /** Only users working at this location (default or assigned). */
  hospitalId?: string;
  roleId?: string;
  status?: UserStatus;
}

export interface AccessPermission {
  action: string;
  code: string;
  description: string | null;
  id: string;
  module: string;
}

export interface UserPermissions {
  effectivePermissionIds: string[];
  permissions: AccessPermission[];
}

export interface UserSummary {
  email: string | null;
  employeeCode: string | null;
  id: string;
  mobile: string | null;
  name: string;
  status: string;
}

export function createUserApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    getMyAccess() {
      return client.request<ApiResponse<MyAccess>>('/users/me/access');
    },
    getMyPreferences() {
      return client.request<ApiResponse<UserPreferences>>('/users/me/preferences');
    },
    updateMyPreferences(body: UserPreferencesInput) {
      return client.request<ApiResponse<UserPreferences>>('/users/me/preferences', {
        body,
        method: 'PATCH',
      });
    },
    changeMyPassword(body: ChangePasswordInput) {
      return client.request<ApiResponse<{ changed: true }>>('/users/me/password', {
        body,
        method: 'POST',
      });
    },
    assignUserLocations(body: { hospitalIds: string[]; userIds: string[] }) {
      return client.request<
        ApiResponse<{ updated: Array<{ id: string; name: string }>; updatedCount: number }>
      >('/users/locations', { body, method: 'POST' });
    },
    createUser(body: AccessUserInput) {
      return client.request<ApiResponse<AccessUser>>('/users', { body, method: 'POST' });
    },
    getUserPermissions(id: string) {
      return client.request<ApiResponse<UserPermissions>>(`/users/${id}/permissions`);
    },
    listRoles(query?: ListQuery) {
      return client.request<ApiResponse<ApiList<AccessRole>>>('/roles', { query });
    },
    listUsers(query?: AccessUserListQuery) {
      return client.request<ApiResponse<ApiList<AccessUser>>>('/users', { query });
    },
    replaceUserPermissions(id: string, permissionIds: string[]) {
      return client.request<ApiResponse<UserPermissions>>(`/users/${id}/permissions`, {
        body: { permissionIds },
        method: 'PUT',
      });
    },
    updateUser(id: string, body: Partial<AccessUserInput>) {
      return client.request<ApiResponse<AccessUser>>(`/users/${id}`, { body, method: 'PUT' });
    },
  };
}
