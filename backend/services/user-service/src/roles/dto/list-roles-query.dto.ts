import { RecordStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListRolesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RecordStatus })
  @IsEnum(RecordStatus)
  @IsOptional()
  status?: RecordStatus;
}
