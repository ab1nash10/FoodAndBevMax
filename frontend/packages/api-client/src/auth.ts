import { createApiClient, type ApiClientOptions, type ApiResponse } from './http';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SendOtpRequest {
  email?: string;
  mobile?: string;
}

export interface VerifyOtpRequest extends SendOtpRequest {
  otp: string;
}

export interface EmailPasswordLoginRequest {
  email: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export function createAuthApi(options: ApiClientOptions) {
  const client = createApiClient(options);

  return {
    logout(body: LogoutRequest) {
      return client.request<ApiResponse<{ loggedOut: boolean }>>('/auth/logout', {
        body,
        method: 'POST',
      });
    },
    loginWithPassword(body: EmailPasswordLoginRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/login-with-password', {
        body,
        method: 'POST',
      });
    },
    refresh(body: RefreshTokenRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/refresh', {
        body,
        method: 'POST',
      });
    },
    sendOtp(body: SendOtpRequest) {
      return client.request<ApiResponse<{ channel: 'email' | 'mobile' }>>('/auth/send-otp', {
        body,
        method: 'POST',
      });
    },
    verifyOtp(body: VerifyOtpRequest) {
      return client.request<ApiResponse<AuthTokens>>('/auth/verify-otp', {
        body,
        method: 'POST',
      });
    },
  };
}
