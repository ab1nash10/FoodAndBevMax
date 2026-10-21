import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  controllers: [PosController],
  imports: [CommonModule],
  providers: [PosService],
})
export class PosModule {}
