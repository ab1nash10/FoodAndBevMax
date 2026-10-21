import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CodeCase, DisplayName } from '../../common/display-name.decorator';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'EMP001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @CodeCase()
  employeeCode!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @DisplayName()
  employeeName!: string;

  @ApiPropertyOptional({ example: 'Nursing', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  department?: string | null;

  @ApiPropertyOptional({ example: 'Staff Nurse', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  designation?: string | null;

  @ApiPropertyOptional({ example: '9999999999', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  eligibleForDiscount?: boolean;

  // Required for new employees; an update may leave it out (older records have none).
  @ApiProperty({ description: 'On roll or outsourced', enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'The location the employee works at; null or omitted shares them with every location',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  hospitalId?: string | null;
}
