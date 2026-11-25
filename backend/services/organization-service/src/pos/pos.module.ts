import { RedisService, SmsService } from '@aahar/auth';
import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';
import { PosController } from './pos.controller';
import { OnlinePaymentsController } from './online-payments.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { PosService } from './pos.service';
import { QrOrdersController } from './qr-orders.controller';
import { QrOrdersService } from './qr-orders.service';
import { StaffDiscountOtpService } from './staff-discount-otp.service';
import { ShiftReconciliationController } from './shift-reconciliation.controller';
import { ShiftReconciliationService } from './shift-reconciliation.service';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  controllers: [
    PosController,
    KioskController,
    ShiftsController,
    ShiftReconciliationController,
    OnlinePaymentsController,
    QrOrdersController,
  ],
  imports: [CommonModule],
  exports: [PosService],
  providers: [
    PosService,
    KioskService,
    ShiftsService,
    ShiftReconciliationService,
    OnlinePaymentsService,
    QrOrdersService,
    StaffDiscountOtpService,
    // QR guests' sign-in codes: Redis when REDIS_URL is set, else this process's memory.
    RedisService,
    SmsService,
  ],
})
export class PosModule {}
