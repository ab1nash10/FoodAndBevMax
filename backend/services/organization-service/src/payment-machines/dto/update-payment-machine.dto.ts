import { PartialType } from '@nestjs/swagger';
import { CreatePaymentMachineDto } from './create-payment-machine.dto';

export class UpdatePaymentMachineDto extends PartialType(CreatePaymentMachineDto) {}
