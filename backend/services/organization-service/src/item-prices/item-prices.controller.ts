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
import { CreateItemPriceDto } from './dto/create-item-price.dto';
import { ListItemPricesQueryDto } from './dto/list-item-prices-query.dto';
import { ResolveItemPriceQueryDto } from './dto/resolve-item-price-query.dto';
import { UpdateItemPriceDto } from './dto/update-item-price.dto';
import { ItemPricesService } from './item-prices.service';

@ApiBearerAuth('access-token')
@ApiTags('item-prices')
@Controller('item-prices')
export class ItemPricesController {
  constructor(private readonly itemPrices: ItemPricesService) {}

  @Get()
  @Permissions('ITEM_PRICE_VIEW')
  @ApiOperation({ summary: 'Get item prices' })
  @ApiOkResponse({ description: 'Item prices returned successfully.' })
  async list(@Query() query: ListItemPricesQueryDto) {
    return {
      data: await this.itemPrices.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get('resolve')
  @Permissions('ITEM_PRICE_VIEW')
  @ApiOperation({ summary: 'Resolve item price for future restaurant operations and POS' })
  @ApiOkResponse({ description: 'Item price resolved successfully.' })
  async resolve(@Query() query: ResolveItemPriceQueryDto) {
    return {
      data: await this.itemPrices.resolve(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('ITEM_PRICE_VIEW')
  @ApiOperation({ summary: 'Get item price by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item price returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.itemPrices.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('ITEM_PRICE_CREATE')
  @ApiBody({ type: CreateItemPriceDto })
  @ApiOperation({ summary: 'Create item price' })
  @ApiOkResponse({ description: 'Item price created successfully.' })
  async create(
    @Body() body: CreateItemPriceDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemPrices.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('ITEM_PRICE_UPDATE')
  @ApiBody({ type: UpdateItemPriceDto })
  @ApiOperation({ summary: 'Update item price' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item price updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemPriceDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemPrices.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('ITEM_PRICE_DELETE')
  @ApiOperation({ summary: 'Delete item price' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Item price deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.itemPrices.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
