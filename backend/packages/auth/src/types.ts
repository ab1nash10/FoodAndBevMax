export interface JwtPayload {
  sub: string;
  email?: string | null;
  mobile?: string | null;
  name?: string;
  permissions?: string[];
  roles?: string[];
  /** The user's session version at issue; see isSessionCurrent. */
  sv?: number;
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
