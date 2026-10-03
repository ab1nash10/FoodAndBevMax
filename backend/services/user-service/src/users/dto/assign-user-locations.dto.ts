import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class AssignUserLocationsDto {
  @ApiProperty({ description: 'Users whose locations are being replaced.', type: [String] })
  @ArrayMaxSize(500)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  userIds!: string[];

  @ApiProperty({
    description:
      'Locations to assign to every listed user. Each user is still validated against their own role: a single-location role accepts exactly one.',
    type: [String],
  })
  @ArrayMaxSize(500)
  @IsArray()
  @IsUUID(undefined, { each: true })
  hospitalIds!: string[];
}
