import {
  createApiClient,
  type ApiClientOptions,
  type ApiList,
  type ApiResponse,
  type ListQuery,
} from './http';

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
  designation?: string;
  email?: string;
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

export interface AppNotification {
  body: string | null;
  category: string;
  createdAt: string;
  entityId: string | null;
  entityName: string | null;
  id: string;
  isRead: boolean;
  link: string | null;
  readAt: string | null;
  title: string;
}

export interface NotificationList {
  items: AppNotification[];
  meta: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
    unreadCount: number;
  };
}

export interface NotificationListQuery {
  limit?: number;
  page?: number;
  unreadOnly?: boolean;
}

export type ThemePreference = 'dark' | 'light' | 'system';

/** Unset fields are null: the portal then keeps its usual behaviour. */
export interface UserPreferences {
  /** "all", a location id, or null. */
  defaultLocationId: string | null;
  /** Categories hidden from the bell; ACCESS can never be muted. */
  mutedNotificationCategories: string[];
  /** A portal path such as /inventory/grns, or null for the dashboard. */
  startPage: string | null;
  theme: ThemePreference | null;
}

/** Partial update: omitted fields are kept, null resets a field to its default. */
export type UserPreferencesInput = Partial<UserPreferences>;

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface UnreadCount {
  unreadCount: number;
}

export interface AccessUserListQuery extends ListQuery {
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
    listNotifications(query?: NotificationListQuery) {
      return client.request<ApiResponse<NotificationList>>('/notifications', { query });
    },
    getUnreadNotificationCount() {
      return client.request<ApiResponse<UnreadCount>>('/notifications/unread-count');
    },
    markNotificationRead(id: string, isRead = true) {
      return client.request<ApiResponse<UnreadCount>>(`/notifications/${id}/read`, {
        body: { isRead },
        method: 'PATCH',
      });
    },
    markAllNotificationsRead() {
      return client.request<ApiResponse<UnreadCount>>('/notifications/read-all', {
        method: 'POST',
      });
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
