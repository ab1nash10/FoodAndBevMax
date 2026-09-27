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
import { CreateItemCategoryDto } from './dto/create-item-category.dto';
import { ListItemCategoriesQueryDto } from './dto/list-item-categories-query.dto';
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

  @Delete(':id')
  @Permissions('ITEM_CATEGORY_DELETE')
  @ApiOperation({ summary: 'Delete item category' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item category deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemCategories.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
