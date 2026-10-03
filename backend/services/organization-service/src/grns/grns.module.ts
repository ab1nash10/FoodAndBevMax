import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GrnsController } from './grns.controller';
import { GrnsRepository } from './grns.repository';
import { GrnsService } from './grns.service';

@Module({
  controllers: [GrnsController],
  imports: [CommonModule],
  providers: [GrnsRepository, GrnsService],
})
export class GrnsModule {}
