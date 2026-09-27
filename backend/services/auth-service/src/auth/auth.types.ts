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
  type: 'refresh';
}
