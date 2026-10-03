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
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateStoreDto } from './dto/create-store.dto';
import { ListStoresQueryDto } from './dto/list-stores-query.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService } from './stores.service';

@ApiBearerAuth('access-token')
@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  @Permissions('STORE_VIEW')
  @ApiOperation({ summary: 'Get stores' })
  @ApiOkResponse({ description: 'Stores returned successfully.' })
  async list(@Query() query: ListStoresQueryDto) {
    return {
      data: await this.stores.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('STORE_VIEW')
  @ApiOperation({ summary: 'Get store by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.stores.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('STORE_CREATE')
  @ApiBody({ type: CreateStoreDto })
  @ApiOperation({ summary: 'Create store' })
  @ApiOkResponse({ description: 'Store created successfully.' })
  async create(
    @Body() body: CreateStoreDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.stores.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('STORE_UPDATE')
  @ApiBody({ type: UpdateStoreDto })
  @ApiOperation({ summary: 'Update store' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStoreDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.stores.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('STORE_DELETE')
  @ApiOperation({ summary: 'Delete store' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.stores.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
