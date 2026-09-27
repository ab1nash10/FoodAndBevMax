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
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { ListKitchensQueryDto } from './dto/list-kitchens-query.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';
import { KitchensService } from './kitchens.service';

@ApiBearerAuth('access-token')
@ApiTags('kitchens')
@Controller('kitchens')
export class KitchensController {
  constructor(private readonly kitchens: KitchensService) {}

  @Get()
  @Permissions('KITCHEN_VIEW')
  @ApiOperation({ summary: 'Get kitchens' })
  @ApiOkResponse({ description: 'Kitchens returned successfully.' })
  async list(@Query() query: ListKitchensQueryDto) {
    return {
      data: await this.kitchens.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('KITCHEN_VIEW')
  @ApiOperation({ summary: 'Get kitchen by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.kitchens.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('KITCHEN_CREATE')
  @ApiBody({ type: CreateKitchenDto })
  @ApiOperation({ summary: 'Create kitchen' })
  @ApiOkResponse({ description: 'Kitchen created successfully.' })
  async create(
    @Body() body: CreateKitchenDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchens.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('KITCHEN_UPDATE')
  @ApiBody({ type: UpdateKitchenDto })
  @ApiOperation({ summary: 'Update kitchen' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateKitchenDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchens.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('KITCHEN_DELETE')
  @ApiOperation({ summary: 'Delete kitchen' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Kitchen deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.kitchens.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
