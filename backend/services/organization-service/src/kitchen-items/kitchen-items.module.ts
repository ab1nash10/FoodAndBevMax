import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { KitchenItemsController } from './kitchen-items.controller';
import { KitchenItemsRepository } from './kitchen-items.repository';
import { KitchenItemsService } from './kitchen-items.service';

@Module({
  controllers: [KitchenItemsController],
  imports: [CommonModule],
  providers: [KitchenItemsRepository, KitchenItemsService],
})
export class KitchenItemsModule {}
