import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { LegalEntitiesController } from './legal-entities.controller';
import { LegalEntitiesRepository } from './legal-entities.repository';
import { LegalEntitiesService } from './legal-entities.service';

@Module({
  controllers: [LegalEntitiesController],
  imports: [CommonModule],
  providers: [LegalEntitiesRepository, LegalEntitiesService],
})
export class LegalEntitiesModule {}
