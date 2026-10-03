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
import { CreateLocationDto } from './dto/create-location.dto';
import { ListLocationsQueryDto } from './dto/list-locations-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@ApiBearerAuth('access-token')
@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @Permissions('LOCATION_VIEW')
  @ApiOperation({ summary: 'Get locations' })
  @ApiOkResponse({ description: 'Locations returned successfully.' })
  async list(@Query() query: ListLocationsQueryDto) {
    return {
      data: await this.locations.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('LOCATION_VIEW')
  @ApiOperation({ summary: 'Get location by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.locations.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('LOCATION_CREATE')
  @ApiBody({ type: CreateLocationDto })
  @ApiOperation({ summary: 'Create location' })
  @ApiOkResponse({ description: 'Location created successfully.' })
  async create(
    @Body() body: CreateLocationDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.locations.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('LOCATION_UPDATE')
  @ApiBody({ type: UpdateLocationDto })
  @ApiOperation({ summary: 'Update location' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLocationDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.locations.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('LOCATION_DELETE')
  @ApiOperation({ summary: 'Delete location' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Location deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.locations.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
