import { PartialType } from '@nestjs/swagger';
import { CreateItemPriceDto } from './create-item-price.dto';

export class UpdateItemPriceDto extends PartialType(CreateItemPriceDto) {}
