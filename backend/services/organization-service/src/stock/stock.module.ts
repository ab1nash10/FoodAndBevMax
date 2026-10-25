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
  StockDiscardsController,
  StockLedgersController,
  StoreStockLevelsController,
  StoreStockMovementsController,
  StoreStockSummaryController,
} from './stock.controller';
import { StockDiscardService } from './stock-discard.service';
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
    StockDiscardsController,
  ],
  imports: [CommonModule],
  providers: [StockDiscardService, StockRepository, StockService],
})
export class StockModule {}
