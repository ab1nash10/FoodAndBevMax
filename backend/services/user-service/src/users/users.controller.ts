import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  getActorId,
  getActorRoles,
  getIpAddress,
  type RequestContextLike,
} from '../common/request-context';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AssignUserLocationsDto } from './dto/assign-user-locations.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ReplaceUserPermissionsDto } from './dto/replace-user-permissions.dto';
import { UsersService } from './users.service';

@ApiBearerAuth('access-token')
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('USER_VIEW')
  @ApiOperation({ summary: 'Get users' })
  @ApiOkResponse({ description: 'Users returned successfully.' })
  async list(@Query() query: ListUsersQueryDto, @CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.users.list(query, { actor: user }),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('USER_VIEW')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'User returned successfully.' })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.users.getById(id, { actor: user }),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('USER_CREATE')
  @ApiBody({ type: CreateUserDto })
  @ApiOperation({ summary: 'Create user' })
  @ApiOkResponse({ description: 'User created successfully.' })
  async create(
    @Body() body: CreateUserDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.create(body, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('USER_UPDATE')
  @ApiBody({ type: UpdateUserDto })
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'User updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.update(id, body, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('USER_DELETE')
  @ApiOperation({ summary: 'Delete user' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'User deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.remove(id, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post(':id/roles')
  @Permissions('USER_UPDATE')
  @ApiBody({ type: AssignRoleDto })
  @ApiOperation({ summary: 'Assign role to user' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Role assigned successfully.' })
  async assignRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignRoleDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.assignRole(id, body, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('locations')
  @Permissions('USER_UPDATE')
  @ApiBody({ type: AssignUserLocationsDto })
  @ApiOperation({ summary: 'Assign locations to several users at once' })
  @ApiOkResponse({ description: 'Locations assigned successfully.' })
  async assignLocations(
    @Body() body: AssignUserLocationsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.assignLocations(body, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id/permissions')
  @Permissions('USER_UPDATE')
  @ApiOperation({ summary: 'Get effective permissions for a user' })
  async getPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.users.getPermissions(id, { actor: user }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id/permissions')
  @Permissions('USER_UPDATE')
  @ApiBody({ type: ReplaceUserPermissionsDto })
  @ApiOperation({ summary: 'Replace effective permissions for a user' })
  async replacePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplaceUserPermissionsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.users.replacePermissions(id, body, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
