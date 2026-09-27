import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ItemPricesController } from './item-prices.controller';
import { ItemPricesRepository } from './item-prices.repository';
import { ItemPricesService } from './item-prices.service';

@Module({
  controllers: [ItemPricesController],
  imports: [CommonModule],
  providers: [ItemPricesRepository, ItemPricesService],
})
export class ItemPricesModule {}
