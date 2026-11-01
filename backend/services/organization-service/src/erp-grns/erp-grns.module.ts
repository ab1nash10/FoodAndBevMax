import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GrnsModule } from '../grns/grns.module';
import { ErpGrnsController, GrnEntriesController } from './erp-grns.controller';
import { ErpGrnsService } from './erp-grns.service';
import { ErpSignatureGuard } from './erp-signature.guard';

@Module({
  controllers: [ErpGrnsController, GrnEntriesController],
  imports: [CommonModule, GrnsModule],
  providers: [ErpGrnsService, ErpSignatureGuard],
})
export class ErpGrnsModule {}
