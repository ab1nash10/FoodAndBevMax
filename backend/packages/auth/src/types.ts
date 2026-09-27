export interface JwtPayload {
  sub: string;
  email?: string | null;
  mobile?: string | null;
  permissions?: string[];
  roles?: string[];
  /** Set only on refresh tokens. */
  type?: 'refresh';
}

export type LocationScopeName = 'ALL' | 'MULTI' | 'SINGLE';

export interface JwtRequestUser {
  id: string;
  email?: string | null;
  mobile?: string | null;
  permissions: string[];
  roles: string[];
  /** Widest scope across the user's roles. */
  locationScope: LocationScopeName;
  /** Hospitals the user may act in. `null` means every hospital (LocationScope.ALL). */
  allowedHospitalIds: string[] | null;
}
