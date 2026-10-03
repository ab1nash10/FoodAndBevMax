import { PartialType } from '@nestjs/swagger';
import { CreatePosDeviceDto } from './create-pos-device.dto';

export class UpdatePosDeviceDto extends PartialType(CreatePosDeviceDto) {}
