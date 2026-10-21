import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RestaurantMenusImportService } from './restaurant-menus-import.service';
import { RestaurantMenusController } from './restaurant-menus.controller';
import { RestaurantMenusRepository } from './restaurant-menus.repository';
import { RestaurantMenusService } from './restaurant-menus.service';

@Module({
  controllers: [RestaurantMenusController],
  exports: [RestaurantMenusService],
  imports: [CommonModule],
  providers: [RestaurantMenusImportService, RestaurantMenusRepository, RestaurantMenusService],
})
export class RestaurantMenusModule {}
