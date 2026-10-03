import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RestaurantMenusController } from './restaurant-menus.controller';
import { RestaurantMenusRepository } from './restaurant-menus.repository';
import { RestaurantMenusService } from './restaurant-menus.service';

@Module({
  controllers: [RestaurantMenusController],
  imports: [CommonModule],
  providers: [RestaurantMenusRepository, RestaurantMenusService],
})
export class RestaurantMenusModule {}
