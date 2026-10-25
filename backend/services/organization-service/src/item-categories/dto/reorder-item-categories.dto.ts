import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Every category's id in the order they should come on menus, the till and the kiosk. */
export class ReorderItemCategoriesDto {
  @ApiProperty({ description: 'Category ids, first to last.', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}
