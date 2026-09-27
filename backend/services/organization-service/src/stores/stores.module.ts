import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

@Module({
  controllers: [StoresController],
  imports: [CommonModule],
  providers: [StoresRepository, StoresService],
})
export class StoresModule {}
