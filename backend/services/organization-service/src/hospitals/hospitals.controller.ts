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
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { ListHospitalsQueryDto } from './dto/list-hospitals-query.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { HospitalsService } from './hospitals.service';

@ApiBearerAuth('access-token')
@ApiTags('locations')
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitals: HospitalsService) {}

  @Get()
  @Permissions('HOSPITAL_VIEW')
  @ApiOperation({ summary: 'Get locations' })
  @ApiOkResponse({ description: 'Locations returned successfully.' })
  async list(@Query() query: ListHospitalsQueryDto) {
    return {
      data: await this.hospitals.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('HOSPITAL_VIEW')
  @ApiOperation({ summary: 'Get location by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.hospitals.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('HOSPITAL_CREATE')
  @ApiBody({ type: CreateHospitalDto })
  @ApiOperation({ summary: 'Create location' })
  @ApiOkResponse({ description: 'Location created successfully.' })
  async create(
    @Body() body: CreateHospitalDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.hospitals.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('HOSPITAL_UPDATE')
  @ApiBody({ type: UpdateHospitalDto })
  @ApiOperation({ summary: 'Update location' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateHospitalDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.hospitals.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('HOSPITAL_DELETE')
  @ApiOperation({ summary: 'Delete location' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.hospitals.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
