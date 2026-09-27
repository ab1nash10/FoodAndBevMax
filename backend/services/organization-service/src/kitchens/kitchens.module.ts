import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { KitchensController } from './kitchens.controller';
import { KitchensRepository } from './kitchens.repository';
import { KitchensService } from './kitchens.service';

@Module({
  controllers: [KitchensController],
  imports: [CommonModule],
  providers: [KitchensRepository, KitchensService],
})
export class KitchensModule {}
