import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  controllers: [ItemsController],
  exports: [ItemsService],
  imports: [CommonModule],
  providers: [ItemsRepository, ItemsService],
})
export class ItemsModule {}
