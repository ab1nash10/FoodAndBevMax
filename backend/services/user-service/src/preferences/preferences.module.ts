import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  controllers: [PreferencesController],
  imports: [CommonModule],
  providers: [PreferencesService],
})
export class PreferencesModule {}
