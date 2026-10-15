import { Public } from '@aahar/auth';
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { getIpAddress, type RequestContextLike } from '../common/request-context';
import { AuthService } from './auth.service';
import { MicrosoftSignInService } from './services/microsoft.service';
import { EmailPasswordLoginDto } from './dto/email-password-login.dto';
import { LogoutDto } from './dto/logout.dto';
import { MicrosoftCallbackDto } from './dto/microsoft-callback.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly microsoft: MicrosoftSignInService,
  ) {}

  @Public()
  @Post('send-otp')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBody({ type: SendOtpDto })
  @ApiOperation({ summary: 'Send OTP' })
  @ApiOkResponse({ description: 'OTP sent successfully.' })
  @ApiTooManyRequestsResponse({ description: 'Too many OTP requests.' })
  @ApiNotFoundResponse({ description: 'The number or email does not belong to an active user.' })
  async sendOtp(@Body() body: SendOtpDto) {
    return {
      data: await this.auth.sendOtp(body),
      message: 'OTP sent successfully',
      success: true,
    };
  }

  @Public()
  @Post('verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: VerifyOtpDto })
  @ApiOperation({ summary: 'Verify OTP' })
  @ApiOkResponse({ description: 'OTP verified successfully.' })
  @ApiUnauthorizedResponse({ description: 'Invalid OTP or inactive user.' })
  async verifyOtp(@Body() body: VerifyOtpDto, @Req() request: RequestContextLike) {
    return {
      data: await this.auth.verifyOtp(body, {
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Public()
  @Post('login-with-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: EmailPasswordLoginDto })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ description: 'Signed in successfully.' })
  @ApiUnauthorizedResponse({ description: 'Invalid email, password, or inactive user.' })
  async loginWithPassword(@Body() body: EmailPasswordLoginDto, @Req() request: RequestContextLike) {
    return {
      data: await this.auth.loginWithPassword(body, {
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Public()
  @Post('refresh')
  @ApiBody({ type: RefreshTokenDto })
  @ApiOperation({ summary: 'Refresh token' })
  @ApiOkResponse({ description: 'Tokens refreshed successfully.' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token.' })
  async refresh(@Body() body: RefreshTokenDto, @Req() request: RequestContextLike) {
    return {
      data: await this.auth.refresh(body, {
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Public()
  @Post('logout')
  @ApiBody({ type: LogoutDto })
  @ApiOperation({ summary: 'Logout' })
  @ApiOkResponse({ description: 'Logged out successfully.' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token.' })
  async logout(@Body() body: LogoutDto, @Req() request: RequestContextLike) {
    return {
      data: await this.auth.logout(body, {
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Public()
  @Get('microsoft/config')
  @ApiOperation({ summary: 'Whether Sign in with Microsoft is set up' })
  @ApiOkResponse({ description: 'Returned.' })
  microsoftConfig() {
    return { data: { enabled: this.microsoft.isEnabled() }, message: 'Success', success: true };
  }

  @Public()
  @Post('microsoft/authorize')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Start Sign in with Microsoft: the Microsoft sign-in page to open' })
  @ApiOkResponse({ description: 'Sign-in URL returned.' })
  async microsoftAuthorize() {
    return {
      data: { url: await this.microsoft.authorizeUrl() },
      message: 'Success',
      success: true,
    };
  }

  @Public()
  @Post('microsoft/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiBody({ type: MicrosoftCallbackDto })
  @ApiOperation({ summary: 'Finish Sign in with Microsoft' })
  @ApiOkResponse({ description: 'Signed in.' })
  @ApiNotFoundResponse({ description: 'No active AAHAR user has that email.' })
  @ApiUnauthorizedResponse({ description: 'Microsoft did not confirm the sign-in.' })
  async microsoftCallback(@Body() body: MicrosoftCallbackDto, @Req() request: RequestContextLike) {
    return {
      data: await this.auth.loginWithMicrosoft(body, { ipAddress: getIpAddress(request) }),
      message: 'Success',
      success: true,
    };
  }
}
