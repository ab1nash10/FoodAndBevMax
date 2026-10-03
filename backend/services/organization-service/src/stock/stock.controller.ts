import { Permissions } from '@aahar/auth';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListStockBalancesQueryDto } from './dto/list-stock-balances-query.dto';
import { ListStockLedgersQueryDto } from './dto/list-stock-ledgers-query.dto';
import { StockService } from './stock.service';

@ApiBearerAuth('access-token')
@ApiTags('stock-ledgers')
@Controller('stock-ledgers')
export class StockLedgersController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('STOCK_VIEW')
  @ApiOperation({ summary: 'Get stock ledger entries' })
  @ApiOkResponse({ description: 'Stock ledger entries returned successfully.' })
  async list(@Query() query: ListStockLedgersQueryDto) {
    return { data: await this.stock.listLedgers(query), message: 'Success', success: true };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('store-stock')
@Controller('store-stock/summary')
export class StoreStockSummaryController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('STOCK_VIEW')
  @ApiOperation({ summary: 'Get grouped store stock by store and item' })
  @ApiOkResponse({ description: 'Grouped store stock returned successfully.' })
  async list(@Query() query: ListStockBalancesQueryDto) {
    return {
      data: await this.stock.listStoreSummaries(query),
      message: 'Success',
      success: true,
    };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('stock-balances')
@Controller('stock-balances')
export class StockBalancesController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('STOCK_VIEW')
  @ApiOperation({ summary: 'Get current stock balances' })
  @ApiOkResponse({ description: 'Stock balances returned successfully.' })
  async list(@Query() query: ListStockBalancesQueryDto) {
    return { data: await this.stock.listBalances(query), message: 'Success', success: true };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('restaurant-stock-ledgers')
@Controller('restaurant-stock-ledgers')
export class RestaurantStockLedgersController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('RESTAURANT_STOCK_VIEW')
  @ApiOperation({ summary: 'Get restaurant stock ledger entries' })
  @ApiOkResponse({ description: 'Restaurant stock ledger entries returned successfully.' })
  async list(@Query() query: ListStockLedgersQueryDto) {
    return {
      data: await this.stock.listRestaurantLedgers(query),
      message: 'Success',
      success: true,
    };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('restaurant-stock')
@Controller('restaurant-stock')
export class RestaurantStockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('RESTAURANT_STOCK_VIEW')
  @ApiOperation({ summary: 'Get current restaurant stock balances' })
  @ApiOkResponse({ description: 'Restaurant stock balances returned successfully.' })
  async list(@Query() query: ListStockBalancesQueryDto) {
    return {
      data: await this.stock.listRestaurantBalances(query),
      message: 'Success',
      success: true,
    };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('kitchen-stock-ledgers')
@Controller('kitchen-stock-ledgers')
export class KitchenStockLedgersController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('KITCHEN_STOCK_VIEW')
  @ApiOperation({ summary: 'Get kitchen stock ledger entries' })
  @ApiOkResponse({ description: 'Kitchen stock ledger entries returned successfully.' })
  async list(@Query() query: ListStockLedgersQueryDto) {
    return {
      data: await this.stock.listKitchenLedgers(query),
      message: 'Success',
      success: true,
    };
  }
}

@ApiBearerAuth('access-token')
@ApiTags('kitchen-stock')
@Controller('kitchen-stock')
export class KitchenStockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @Permissions('KITCHEN_STOCK_VIEW')
  @ApiOperation({ summary: 'Get current kitchen stock balances' })
  @ApiOkResponse({ description: 'Kitchen stock balances returned successfully.' })
  async list(@Query() query: ListStockBalancesQueryDto) {
    return {
      data: await this.stock.listKitchenBalances(query),
      message: 'Success',
      success: true,
    };
  }
}
