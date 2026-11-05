import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmploymentType, Gender } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { CodeCase, DisplayName } from '../../common/display-name.decorator';

const day = /^\d{4}-\d{2}-\d{2}$/;

export class CreateEmployeeDto {
  @ApiPropertyOptional({
    description: 'Left out, the next free EMP code is given',
    example: 'EMP001',
  })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @CodeCase()
  employeeCode?: string;

  @ApiPropertyOptional({ example: 'ravi.kumar@maxhealthcare.com', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  officialEmail?: string | null;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({ example: '1990-04-12', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(day, { message: 'birthDate must be a date (YYYY-MM-DD)' })
  birthDate?: string | null;

  @ApiPropertyOptional({ example: '2024-01-15', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(day, { message: 'joiningDate must be a date (YYYY-MM-DD)' })
  joiningDate?: string | null;

  @ApiPropertyOptional({ example: 'L2', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  employeeLevel?: string | null;

  @ApiPropertyOptional({ description: "Starts as the location's entity", nullable: true })
  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @ApiPropertyOptional({ description: 'The employee they report to', nullable: true })
  @IsOptional()
  @IsUUID()
  reportingManagerId?: string | null;

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
