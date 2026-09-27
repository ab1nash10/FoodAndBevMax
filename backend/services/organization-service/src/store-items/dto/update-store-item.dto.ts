import { PartialType } from '@nestjs/swagger';
import { CreateStoreItemDto } from './create-store-item.dto';

export class UpdateStoreItemDto extends PartialType(CreateStoreItemDto) {}
