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
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemsService } from './items.service';

@ApiBearerAuth('access-token')
@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @Permissions('ITEM_VIEW')
  @ApiOperation({ summary: 'Get items' })
  @ApiOkResponse({ description: 'Items returned successfully.' })
  async list(@Query() query: ListItemsQueryDto) {
    return {
      data: await this.items.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('ITEM_VIEW')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.items.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('ITEM_CREATE')
  @ApiBody({ type: CreateItemDto })
  @ApiOperation({ summary: 'Create item with auto-generated item code' })
  @ApiOkResponse({ description: 'Item created successfully with generated itemCode.' })
  async create(
    @Body() body: CreateItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.items.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('ITEM_UPDATE')
  @ApiBody({ type: UpdateItemDto })
  @ApiOperation({ summary: 'Update item' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.items.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('ITEM_DELETE')
  @ApiOperation({ summary: 'Delete item' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.items.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
