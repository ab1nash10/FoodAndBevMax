import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { PosController } from './pos.controller';
import { OnlinePaymentsController } from './online-payments.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { PosService } from './pos.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [PosController, KioskController, ShiftsController, OnlinePaymentsController],
  imports: [CommonModule],
  providers: [PosService, KioskService, ShiftsService, OnlinePaymentsService],
})
export class PosModule {}
