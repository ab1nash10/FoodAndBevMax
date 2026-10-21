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
import { ImportRowsDto } from '../common/import';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateRestaurantMenuDto } from './dto/create-restaurant-menu.dto';
import { ListRestaurantMenusQueryDto } from './dto/list-restaurant-menus-query.dto';
import { UpdateRestaurantMenuDto } from './dto/update-restaurant-menu.dto';
import { RestaurantMenusImportService } from './restaurant-menus-import.service';
import { RestaurantMenusService } from './restaurant-menus.service';

@ApiBearerAuth('access-token')
@ApiTags('restaurant-menus')
@Controller('restaurant-menus')
export class RestaurantMenusController {
  constructor(
    private readonly restaurantMenus: RestaurantMenusService,
    private readonly restaurantMenusImport: RestaurantMenusImportService,
  ) {}

  @Get()
  @Permissions('RESTAURANT_MENU_VIEW')
  @ApiOperation({ summary: 'Get restaurant menu mappings' })
  @ApiOkResponse({ description: 'Restaurant menu mappings returned successfully.' })
  async list(@Query() query: ListRestaurantMenusQueryDto) {
    return { data: await this.restaurantMenus.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('RESTAURANT_MENU_VIEW')
  @ApiOperation({ summary: 'Get restaurant menu mapping by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant menu mapping returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.restaurantMenus.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('RESTAURANT_MENU_CREATE')
  @ApiBody({ type: CreateRestaurantMenuDto })
  @ApiOperation({ summary: 'Create restaurant menu mapping' })
  @ApiOkResponse({ description: 'Restaurant menu mapping created successfully.' })
  async create(
    @Body() body: CreateRestaurantMenuDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurantMenus.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Post('import')
  @Permissions('RESTAURANT_MENU_CREATE', 'RESTAURANT_MENU_UPDATE')
  @ApiBody({ type: ImportRowsDto })
  @ApiOperation({
    summary: 'Add or update menu items and prices from spreadsheet rows, all or nothing',
  })
  @ApiOkResponse({
    description: 'What each row does (or why it cannot), and whether it was saved.',
  })
  async import(
    @Body() body: ImportRowsDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurantMenusImport.import(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
        permissions: user?.permissions,
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('RESTAURANT_MENU_UPDATE')
  @ApiBody({ type: UpdateRestaurantMenuDto })
  @ApiOperation({ summary: 'Update restaurant menu mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant menu mapping updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRestaurantMenuDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurantMenus.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('RESTAURANT_MENU_DELETE')
  @ApiOperation({ summary: 'Delete restaurant menu mapping' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant menu mapping deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurantMenus.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
