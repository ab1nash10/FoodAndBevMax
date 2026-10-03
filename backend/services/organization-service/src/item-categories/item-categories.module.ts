import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ItemCategoriesController } from './item-categories.controller';
import { ItemCategoriesRepository } from './item-categories.repository';
import { ItemCategoriesService } from './item-categories.service';

@Module({
  controllers: [ItemCategoriesController],
  imports: [CommonModule],
  providers: [ItemCategoriesRepository, ItemCategoriesService],
})
export class ItemCategoriesModule {}
