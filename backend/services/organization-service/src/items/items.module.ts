import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ItemsImportService } from './items-import.service';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  controllers: [ItemsController],
  exports: [ItemsService],
  imports: [CommonModule],
  providers: [ItemsImportService, ItemsRepository, ItemsService],
})
export class ItemsModule {}
