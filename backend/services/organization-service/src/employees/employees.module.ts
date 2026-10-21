import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmployeesImportService } from './employees-import.service';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  exports: [EmployeesService],
  imports: [CommonModule],
  providers: [EmployeesImportService, EmployeesRepository, EmployeesService],
})
export class EmployeesModule {}
