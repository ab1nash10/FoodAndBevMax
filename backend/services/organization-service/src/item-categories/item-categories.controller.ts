import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { ListItemCategoriesQueryDto } from './dto/list-item-categories-query.dto';
import { ReorderItemCategoriesDto } from './dto/reorder-item-categories.dto';
import { UpdateItemCategoryDto } from './dto/update-item-category.dto';
import { ItemCategoriesService } from './item-categories.service';

@ApiBearerAuth('access-token')
@ApiTags('item-categories')
@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly itemCategories: ItemCategoriesService) {}

  @Get()
  @Permissions('ITEM_CATEGORY_VIEW')
  @ApiOperation({ summary: 'Get item categories' })
  @ApiOkResponse({ description: 'Item categories returned successfully.' })
  async list(@Query() query: ListItemCategoriesQueryDto) {
    return {
      data: await this.itemCategories.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('ITEM_CATEGORY_VIEW')
  @ApiOperation({ summary: 'Get item category by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item category returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.itemCategories.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('ITEM_CATEGORY_CREATE')
  @ApiBody({ type: CreateItemCategoryDto })
  @ApiOperation({ summary: 'Create item category' })
  @ApiOkResponse({ description: 'Item category created successfully.' })
  async create(
    @Body() body: CreateItemCategoryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemCategories.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  // Before PUT :id, so "order" is not read as a category id.
  @Put('order')
  @Permissions('ITEM_CATEGORY_UPDATE')
  @ApiBody({ type: ReorderItemCategoriesDto })
  @ApiOperation({ summary: 'Set the order of item categories on menus, the till and the kiosk' })
  @ApiOkResponse({ description: 'Item category order saved successfully.' })
  async reorder(
    @Body() body: ReorderItemCategoriesDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemCategories.reorder(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('ITEM_CATEGORY_UPDATE')
  @ApiBody({ type: UpdateItemCategoryDto })
  @ApiOperation({ summary: 'Update item category' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item category updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemCategoryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemCategories.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
