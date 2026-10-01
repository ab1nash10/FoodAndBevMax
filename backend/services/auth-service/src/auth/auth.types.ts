export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthContext {
  ipAddress?: string;
}

export interface RefreshTokenPayload {
  jti: string;
  sub: string;
  /** The user's session version at issue; refresh is refused once it moves on. */
  sv?: number;
  type: 'refresh';
}
