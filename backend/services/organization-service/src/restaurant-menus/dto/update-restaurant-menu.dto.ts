import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantMenuDto } from './create-restaurant-menu.dto';

export class UpdateRestaurantMenuDto extends PartialType(CreateRestaurantMenuDto) {}
