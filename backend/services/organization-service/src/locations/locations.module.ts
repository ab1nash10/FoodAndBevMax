import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { LocationsController } from './locations.controller';
import { LocationsRepository } from './locations.repository';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController],
  imports: [CommonModule],
  providers: [LocationsRepository, LocationsService],
})
export class LocationsModule {}
