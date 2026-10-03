import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  imports: [CommonModule],
  providers: [EmployeesRepository, EmployeesService],
})
export class EmployeesModule {}
