import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateKitchenItemDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  kitchenId!: string;

  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({
    description: "This mapping's category; the item's other mappings keep their own.",
    example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80',
  })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({
    description:
      'READYMADE: made ahead in batches. LIVE: made to order. Applies to the item in every kitchen; left out, the item keeps its kitchen type (READYMADE for a new one).',
    enum: [ItemType.READYMADE, ItemType.LIVE],
  })
  @IsIn([ItemType.READYMADE, ItemType.LIVE], { message: 'A kitchen item is Readymade or Live.' })
  @IsOptional()
  itemType?: typeof ItemType.READYMADE | typeof ItemType.LIVE;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
