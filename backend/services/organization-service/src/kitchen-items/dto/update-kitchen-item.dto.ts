import { PartialType } from '@nestjs/swagger';
import { CreateKitchenItemDto } from './create-kitchen-item.dto';

export class UpdateKitchenItemDto extends PartialType(CreateKitchenItemDto) {}
