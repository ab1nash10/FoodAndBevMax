import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { Mailer } from '../common/mailer';
import { GrnsModule } from '../grns/grns.module';
import { ErpGrnsController, GrnEntriesController } from './erp-grns.controller';
import { ErpGrnsService } from './erp-grns.service';
import { ErpSignatureGuard } from './erp-signature.guard';

@Module({
  controllers: [ErpGrnsController, GrnEntriesController],
  imports: [CommonModule, GrnsModule],
  providers: [ErpGrnsService, ErpSignatureGuard, Mailer],
})
export class ErpGrnsModule {}
