import { Permissions } from '@aahar/auth';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListPermissionsQueryDto } from './dto/list-permissions-query.dto';
import { PermissionsService } from './permissions.service';

@ApiBearerAuth('access-token')
@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @Permissions('PERMISSION_VIEW')
  @ApiOperation({ summary: 'Get permissions' })
  @ApiOkResponse({ description: 'Permissions returned successfully.' })
  async list(@Query() query: ListPermissionsQueryDto) {
    return {
      data: await this.permissions.list(query),
      message: 'Success',
      success: true,
    };
  }
}
