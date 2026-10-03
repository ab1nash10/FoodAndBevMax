import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { HospitalsController } from './hospitals.controller';
import { HospitalsRepository } from './hospitals.repository';
import { HospitalsService } from './hospitals.service';

@Module({
  controllers: [HospitalsController],
  imports: [CommonModule],
  providers: [HospitalsRepository, HospitalsService],
})
export class HospitalsModule {}
