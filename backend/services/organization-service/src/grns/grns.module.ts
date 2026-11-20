import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GrnsRepository } from './grns.repository';

/** The stock-in repository ERP GRNs use; the Deliveries (GRN) screens and API were removed. */
@Module({
  exports: [GrnsRepository],
  imports: [CommonModule],
  providers: [GrnsRepository],
})
export class GrnsModule {}
