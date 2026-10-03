import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReplaceUserPermissionsDto {
  @ApiProperty({ isArray: true, type: String })
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
