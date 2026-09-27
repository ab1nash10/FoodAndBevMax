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
import { CreatePosDeviceDto } from './dto/create-pos-device.dto';
import { ListPosDevicesQueryDto } from './dto/list-pos-devices-query.dto';
import { UpdatePosDeviceDto } from './dto/update-pos-device.dto';
import { PosDevicesService } from './pos-devices.service';

@ApiBearerAuth('access-token')
@ApiTags('pos-devices')
@Controller('pos-devices')
export class PosDevicesController {
  constructor(private readonly posDevices: PosDevicesService) {}

  @Get()
  @Permissions('POS_DEVICE_VIEW')
  @ApiOperation({ summary: 'Get POS devices' })
  @ApiOkResponse({ description: 'POS devices returned successfully.' })
  async list(@Query() query: ListPosDevicesQueryDto) {
    return {
      data: await this.posDevices.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('POS_DEVICE_VIEW')
  @ApiOperation({ summary: 'Get POS device by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'POS device returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.posDevices.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('POS_DEVICE_CREATE')
  @ApiBody({ type: CreatePosDeviceDto })
  @ApiOperation({ summary: 'Create POS device' })
  @ApiOkResponse({ description: 'POS device created successfully.' })
  async create(
    @Body() body: CreatePosDeviceDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.posDevices.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('POS_DEVICE_UPDATE')
  @ApiBody({ type: UpdatePosDeviceDto })
  @ApiOperation({ summary: 'Update POS device' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'POS device updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePosDeviceDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.posDevices.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('POS_DEVICE_DELETE')
  @ApiOperation({ summary: 'Delete POS device' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'POS device deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.posDevices.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
