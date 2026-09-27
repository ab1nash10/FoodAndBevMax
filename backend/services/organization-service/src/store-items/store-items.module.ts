import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { StoreItemsController } from './store-items.controller';
import { StoreItemsRepository } from './store-items.repository';
import { StoreItemsService } from './store-items.service';

@Module({
  controllers: [StoreItemsController],
  imports: [CommonModule],
  providers: [StoreItemsRepository, StoreItemsService],
})
export class StoreItemsModule {}
