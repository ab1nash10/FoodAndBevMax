import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import {
  CreateEmployeeDiscountDto,
  ListEmployeeDiscountsQueryDto,
  UpdateEmployeeDiscountDto,
} from './dto/employee-discount.dto';
import { EmployeeDiscountsService } from './employee-discounts.service';

@ApiBearerAuth('access-token')
@ApiTags('employee-discounts')
@Controller('employee-discounts')
export class EmployeeDiscountsController {
  constructor(private readonly discounts: EmployeeDiscountsService) {}

  @Get()
  @Permissions('EMPLOYEE_DISCOUNT_VIEW')
  @ApiOperation({ summary: 'Get employee discount rules' })
  @ApiOkResponse({ description: 'Employee discounts returned successfully.' })
  async list(@Query() query: ListEmployeeDiscountsQueryDto) {
    return { data: await this.discounts.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('EMPLOYEE_DISCOUNT_VIEW')
  @ApiOperation({ summary: 'Get an employee discount rule' })
  @ApiParam({ name: 'id' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.discounts.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('EMPLOYEE_DISCOUNT_CREATE')
  @ApiBody({ type: CreateEmployeeDiscountDto })
  @ApiOperation({ summary: 'Create an employee discount rule' })
  async create(
    @Body() body: CreateEmployeeDiscountDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.discounts.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('EMPLOYEE_DISCOUNT_UPDATE')
  @ApiBody({ type: UpdateEmployeeDiscountDto })
  @ApiOperation({ summary: 'Update, archive or restore an employee discount rule' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEmployeeDiscountDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.discounts.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
