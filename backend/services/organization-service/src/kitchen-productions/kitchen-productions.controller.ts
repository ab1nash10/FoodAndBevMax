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
import { CreateKitchenProductionDto } from './dto/create-kitchen-production.dto';
import { ListKitchenProductionsQueryDto } from './dto/list-kitchen-productions-query.dto';
import { UpdateKitchenProductionDto } from './dto/update-kitchen-production.dto';
import { KitchenProductionsService } from './kitchen-productions.service';

@ApiBearerAuth('access-token')
@ApiTags('kitchen-productions')
@Controller('kitchen-productions')
export class KitchenProductionsController {
  constructor(private readonly productions: KitchenProductionsService) {}

  @Get()
  @Permissions('KITCHEN_PRODUCTION_VIEW')
  @ApiOperation({ summary: 'Get kitchen productions' })
  @ApiOkResponse({ description: 'Kitchen productions returned successfully.' })
  async list(@Query() query: ListKitchenProductionsQueryDto) {
    return { data: await this.productions.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('KITCHEN_PRODUCTION_VIEW')
  @ApiOperation({ summary: 'Get kitchen production by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen production returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.productions.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('KITCHEN_PRODUCTION_CREATE')
  @ApiBody({ type: CreateKitchenProductionDto })
  @ApiOperation({ summary: 'Create draft kitchen production' })
  @ApiOkResponse({ description: 'Kitchen production created successfully.' })
  async create(
    @Body() body: CreateKitchenProductionDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.productions.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('KITCHEN_PRODUCTION_UPDATE')
  @ApiBody({ type: UpdateKitchenProductionDto })
  @ApiOperation({ summary: 'Update draft kitchen production' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen production updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateKitchenProductionDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.productions.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('KITCHEN_PRODUCTION_DELETE')
  @ApiOperation({ summary: 'Delete draft kitchen production' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen production deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.productions.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/post')
  @Permissions('KITCHEN_PRODUCTION_POST')
  @ApiOperation({ summary: 'Post kitchen production to kitchen stock' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen production posted successfully.' })
  async post(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.productions.post(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':id/cancel')
  @Permissions('KITCHEN_PRODUCTION_UPDATE')
  @ApiOperation({ summary: 'Cancel draft kitchen production' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen production cancelled successfully.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.productions.cancel(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
