import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import {
  CounterStockController,
  CounterStockLedgersController,
  KitchenStockController,
  KitchenStockLedgersController,
  RestaurantStockController,
  RestaurantStockLedgersController,
  StockBalancesController,
  StockLedgersController,
  StoreStockLevelsController,
  StoreStockMovementsController,
  StoreStockSummaryController,
} from './stock.controller';
import { StockRepository } from './stock.repository';
import { StockService } from './stock.service';

@Module({
  controllers: [
    StockLedgersController,
    StoreStockSummaryController,
    StoreStockLevelsController,
    StoreStockMovementsController,
    StockBalancesController,
    RestaurantStockLedgersController,
    RestaurantStockController,
    KitchenStockLedgersController,
    KitchenStockController,
    CounterStockLedgersController,
    CounterStockController,
  ],
  imports: [CommonModule],
  providers: [StockRepository, StockService],
})
export class StockModule {}
