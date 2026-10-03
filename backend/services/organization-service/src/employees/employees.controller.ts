import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@ApiBearerAuth('access-token')
@ApiTags('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @Permissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'Get employees' })
  @ApiOkResponse({ description: 'Employees returned successfully.' })
  async list(@Query() query: ListEmployeesQueryDto) {
    return {
      data: await this.employees.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get('validate/:employeeCode')
  @Permissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'Validate employee for staff discount workflows' })
  @ApiParam({ name: 'employeeCode' })
  @ApiOkResponse({ description: 'Employee validation returned successfully.' })
  async validate(@Param('employeeCode') employeeCode: string) {
    return {
      data: await this.employees.validateByCode(employeeCode),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('EMPLOYEE_VIEW')
  @ApiOperation({ summary: 'Get employee by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Employee returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.employees.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('EMPLOYEE_CREATE')
  @ApiBody({ type: CreateEmployeeDto })
  @ApiOperation({ summary: 'Create employee' })
  @ApiOkResponse({ description: 'Employee created successfully.' })
  async create(
    @Body() body: CreateEmployeeDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.employees.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('EMPLOYEE_UPDATE')
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiOperation({ summary: 'Update employee' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Employee updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEmployeeDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.employees.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('EMPLOYEE_DELETE')
  @ApiOperation({ summary: 'Delete employee' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Employee deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.employees.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
