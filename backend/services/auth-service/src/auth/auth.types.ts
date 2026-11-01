export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContext {
  ipAddress?: string;
}

export interface RefreshTokenPayload {
  /** When the user signed in (seconds). Carried over on refresh; tokens before it use iat. */
  authTime?: number;
  exp?: number;
  iat?: number;
  jti: string;
  sub: string;
  /** The user's session version at issue; refresh is refused once it moves on. */
  sv?: number;
  type: 'refresh';
}
