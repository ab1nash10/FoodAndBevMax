import { CurrentUser } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { getIpAddress, type RequestContextLike } from '../common/request-context';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PreferencesService } from './preferences.service';

function requireUser(user: JwtRequestUser | undefined): JwtRequestUser {
  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }

  return user;
}

/**
 * Self-service for the signed-in user. Under /users so the ingress and the all-in-one router
 * send it to user-service; no @Permissions, since every user manages only their own account.
 */
@ApiBearerAuth('access-token')
@ApiTags('preferences')
@Controller('users/me')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get my preferences' })
  @ApiOkResponse({ description: 'Preferences returned; unset fields are null.' })
  async get(@CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.preferences.get(requireUser(user).id),
      message: 'Success',
      success: true,
    };
  }

  @Patch('preferences')
  @ApiBody({ type: UpdatePreferencesDto })
  @ApiOperation({ summary: 'Update my preferences (omitted fields are kept)' })
  async update(
    @Body() body: UpdatePreferencesDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.preferences.update(requireUser(user), body),
      message: 'Success',
      success: true,
    };
  }

  // Throttled hard: the current password is checked here, so it must not be guessable.
  @Post('password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOperation({ summary: 'Change my password' })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.preferences.changePassword(requireUser(user), body, getIpAddress(request)),
      message: 'Password changed',
      success: true,
    };
  }
}
