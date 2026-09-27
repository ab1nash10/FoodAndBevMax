import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ActivePaginationQueryDto } from '../../common/dto/active-pagination-query.dto';

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

function toOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
}

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
