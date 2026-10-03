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
import { CreateKitchenItemDto } from './dto/create-kitchen-item.dto';
import { ListKitchenItemsQueryDto } from './dto/list-kitchen-items-query.dto';
import { UpdateKitchenItemDto } from './dto/update-kitchen-item.dto';
import { KitchenItemsService } from './kitchen-items.service';

@ApiBearerAuth('access-token')
@ApiTags('kitchen-items')
@Controller('kitchen-items')
export class KitchenItemsController {
  constructor(private readonly kitchenItems: KitchenItemsService) {}

  @Get()
  @Permissions('KITCHEN_ITEM_VIEW')
  @ApiOperation({ summary: 'Get kitchen item mappings' })
  @ApiOkResponse({ description: 'Kitchen item mappings returned successfully.' })
  async list(@Query() query: ListKitchenItemsQueryDto) {
    return { data: await this.kitchenItems.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('KITCHEN_ITEM_VIEW')
  @ApiOperation({ summary: 'Get kitchen item mapping by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen item mapping returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.kitchenItems.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('KITCHEN_ITEM_CREATE')
  @ApiBody({ type: CreateKitchenItemDto })
  @ApiOperation({ summary: 'Create kitchen item mapping' })
  @ApiOkResponse({ description: 'Kitchen item mapping created successfully.' })
  async create(
    @Body() body: CreateKitchenItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchenItems.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('KITCHEN_ITEM_UPDATE')
  @ApiBody({ type: UpdateKitchenItemDto })
  @ApiOperation({ summary: 'Update kitchen item mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen item mapping updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateKitchenItemDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchenItems.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('KITCHEN_ITEM_DELETE')
  @ApiOperation({ summary: 'Delete kitchen item mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen item mapping deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchenItems.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
