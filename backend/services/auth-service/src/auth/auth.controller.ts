import { Public } from '@aahar/auth';
import { Body, Controller, Post, Req } from '@nestjs/common';
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
import { EmailPasswordLoginDto } from './dto/email-password-login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
