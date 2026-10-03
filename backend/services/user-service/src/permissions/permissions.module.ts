import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [PermissionsController],
  imports: [CommonModule],
  providers: [PermissionsService],
})
export class PermissionsModule {}
