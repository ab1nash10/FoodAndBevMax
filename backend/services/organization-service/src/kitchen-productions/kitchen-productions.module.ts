import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { KitchenProductionsController } from './kitchen-productions.controller';
import { KitchenProductionsRepository } from './kitchen-productions.repository';
import { KitchenProductionsService } from './kitchen-productions.service';

@Module({
  controllers: [KitchenProductionsController],
  imports: [CommonModule],
  providers: [KitchenProductionsRepository, KitchenProductionsService],
})
export class KitchenProductionsModule {}
