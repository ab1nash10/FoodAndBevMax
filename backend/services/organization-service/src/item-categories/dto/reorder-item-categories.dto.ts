import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { UniqueItems } from '../../common/unique-items';

/** Every category's id in the order they should come on menus, the till and the kiosk. */
export class ReorderItemCategoriesDto {
  @ApiProperty({ description: 'Category ids, first to last.', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @UniqueItems()
  @IsUUID('4', { each: true })
  ids!: string[];
}
