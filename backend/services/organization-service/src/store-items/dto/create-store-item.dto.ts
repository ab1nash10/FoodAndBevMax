import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateStoreItemDto {
  @ApiProperty({ example: 'd2d2f99b-0d2d-4c94-8c8a-21d4f90c4f80' })
  @IsUUID()
  storeId!: string;

  @ApiProperty({ example: '40afc7d0-d740-4e96-8625-80c7a8ffbe6f' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
