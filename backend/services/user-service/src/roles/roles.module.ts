import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  imports: [CommonModule],
  providers: [RolesService],
})
export class RolesModule {}
