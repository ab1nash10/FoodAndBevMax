import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';
import { toOptionalBoolean } from '../../common/values';

export const employeeSortFields = [
  'createdAt',
  'department',
  'designation',
  'eligibleForDiscount',
  'employeeCode',
  'employeeName',
  'isActive',
  'mobile',
  'updatedAt',
] as const;

export type EmployeeSortField = (typeof employeeSortFields)[number];

export class ListEmployeesQueryDto extends ActivePaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  eligibleForDiscount?: boolean;

  @ApiPropertyOptional({ default: 'createdAt', enum: employeeSortFields })
  @IsIn(employeeSortFields)
  @IsOptional()
  sortBy?: EmployeeSortField;
}
