import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmployeeDiscountsController } from './employee-discounts.controller';
import { EmployeeDiscountsService } from './employee-discounts.service';

@Module({
  controllers: [EmployeeDiscountsController],
  imports: [CommonModule],
  providers: [EmployeeDiscountsService],
})
export class EmployeeDiscountsModule {}
