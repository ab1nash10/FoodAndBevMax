import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';

@Module({
  controllers: [RestaurantsController],
  imports: [CommonModule],
  providers: [RestaurantsRepository, RestaurantsService],
})
export class RestaurantsModule {}
