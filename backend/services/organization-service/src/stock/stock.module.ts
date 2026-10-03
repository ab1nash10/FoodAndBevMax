import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import {
  KitchenStockController,
  KitchenStockLedgersController,
  RestaurantStockController,
  RestaurantStockLedgersController,
  StockBalancesController,
  StockLedgersController,
  StoreStockSummaryController,
} from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

@Module({
  controllers: [
    StockLedgersController,
    StoreStockSummaryController,
    StockBalancesController,
    RestaurantStockLedgersController,
    RestaurantStockController,
    KitchenStockLedgersController,
    KitchenStockController,
  ],
  imports: [CommonModule],
  providers: [StockRepository, StockService],
})
export class StockModule {}
