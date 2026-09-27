import { PartialType } from '@nestjs/swagger';
import { CreateKitchenProductionDto } from './create-kitchen-production.dto';

export class UpdateKitchenProductionDto extends PartialType(CreateKitchenProductionDto) {}
