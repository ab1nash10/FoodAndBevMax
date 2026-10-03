import { PartialType } from '@nestjs/swagger';
import { CreateGrnDto } from './create-grn.dto';

export class UpdateGrnDto extends PartialType(CreateGrnDto) {}
