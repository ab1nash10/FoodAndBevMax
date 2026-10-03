import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateGrnDto } from './dto/create-grn.dto';
import { ListGrnsQueryDto } from './dto/list-grns-query.dto';
import { UpdateGrnDto } from './dto/update-grn.dto';
import { GrnsService } from './grns.service';

@ApiBearerAuth('access-token')
@ApiTags('grns')
@Controller('grns')
export class GrnsController {
  constructor(private readonly grns: GrnsService) {}

  @Get()
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'Get GRNs' })
  @ApiOkResponse({ description: 'GRNs returned successfully.' })
  async list(@Query() query: ListGrnsQueryDto) {
    return { data: await this.grns.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'Get GRN by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'GRN returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.grns.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('GRN_CREATE')
  @ApiBody({ type: CreateGrnDto })
  @ApiOperation({ summary: 'Create draft GRN' })
  @ApiOkResponse({ description: 'GRN created successfully.' })
  async create(
    @Body() body: CreateGrnDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.grns.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('GRN_UPDATE')
  @ApiBody({ type: UpdateGrnDto })
  @ApiOperation({ summary: 'Update draft GRN' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'GRN updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGrnDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.grns.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('GRN_DELETE')
  @ApiOperation({ summary: 'Delete draft GRN' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'GRN deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.grns.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/post-to-stock')
  @Permissions('GRN_POST')
  @ApiOperation({ summary: 'Post GRN accepted quantities to store stock' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'GRN posted to stock successfully.' })
  async postToStock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.grns.postToStock(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/cancel')
  @Permissions('GRN_UPDATE')
  @ApiOperation({ summary: 'Cancel draft GRN' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'GRN cancelled successfully.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.grns.cancel(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
