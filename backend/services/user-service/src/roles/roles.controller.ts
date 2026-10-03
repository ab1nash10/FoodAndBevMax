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
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { ListRolesQueryDto } from './dto/list-roles-query.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@ApiBearerAuth('access-token')
@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions('ROLE_VIEW')
  @ApiOperation({ summary: 'Get roles' })
  @ApiOkResponse({ description: 'Roles returned successfully.' })
  async list(@Query() query: ListRolesQueryDto) {
    return {
      data: await this.roles.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('ROLE_VIEW')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Role returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.roles.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('ROLE_CREATE')
  @ApiBody({ type: CreateRoleDto })
  @ApiOperation({ summary: 'Create role' })
  @ApiOkResponse({ description: 'Role created successfully.' })
  async create(
    @Body() body: CreateRoleDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.roles.create(body, {
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
  @Permissions('ROLE_UPDATE')
  @ApiBody({ type: UpdateRoleDto })
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Role updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.roles.update(id, body, {
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
  @Permissions('ROLE_DELETE')
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Role deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.roles.remove(id, {
        actorId: getActorId(user),
        actor: user,
        actorRoles: getActorRoles(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post(':id/permissions')
  @Permissions('ROLE_UPDATE')
  @ApiBody({ type: AssignPermissionsDto })
  @ApiOperation({ summary: 'Assign permissions to role' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Permissions assigned successfully.' })
  async assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignPermissionsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.roles.assignPermissions(id, body, {
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
