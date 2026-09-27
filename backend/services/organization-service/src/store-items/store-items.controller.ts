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
import { CreateStoreItemDto } from './dto/create-store-item.dto';
import { ListStoreItemsQueryDto } from './dto/list-store-items-query.dto';
import { UpdateStoreItemDto } from './dto/update-store-item.dto';
import { StoreItemsService } from './store-items.service';

@ApiBearerAuth('access-token')
@ApiTags('store-items')
@Controller('store-items')
export class StoreItemsController {
  constructor(private readonly storeItems: StoreItemsService) {}

  @Get()
  @Permissions('STORE_ITEM_VIEW')
  @ApiOperation({ summary: 'Get store item mappings' })
  @ApiOkResponse({ description: 'Store item mappings returned successfully.' })
  async list(@Query() query: ListStoreItemsQueryDto) {
    return { data: await this.storeItems.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('STORE_ITEM_VIEW')
  @ApiOperation({ summary: 'Get store item mapping by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store item mapping returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.storeItems.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('STORE_ITEM_CREATE')
  @ApiBody({ type: CreateStoreItemDto })
  @ApiOperation({ summary: 'Create store item mapping' })
  @ApiOkResponse({ description: 'Store item mapping created successfully.' })
  async create(
    @Body() body: CreateStoreItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.storeItems.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('STORE_ITEM_UPDATE')
  @ApiBody({ type: UpdateStoreItemDto })
  @ApiOperation({ summary: 'Update store item mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store item mapping updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStoreItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.storeItems.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('STORE_ITEM_DELETE')
  @ApiOperation({ summary: 'Delete store item mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Store item mapping deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.storeItems.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
