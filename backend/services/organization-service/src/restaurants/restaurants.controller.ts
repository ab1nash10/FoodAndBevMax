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
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';
import { RestaurantsService } from './restaurants.service';

@ApiBearerAuth('access-token')
@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Get()
  @Permissions('RESTAURANT_VIEW')
  @ApiOperation({ summary: 'Get restaurants' })
  @ApiOkResponse({ description: 'Restaurants returned successfully.' })
  async list(@Query() query: ListRestaurantsQueryDto) {
    return {
      data: await this.restaurants.list(query),
      message: 'Success',
      success: true,
    };
  }

  @Get(':id')
  @Permissions('RESTAURANT_VIEW')
  @ApiOperation({ summary: 'Get restaurant by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return {
      data: await this.restaurants.getById(id),
      message: 'Success',
      success: true,
    };
  }

  @Post()
  @Permissions('RESTAURANT_CREATE')
  @ApiBody({ type: CreateRestaurantDto })
  @ApiOperation({ summary: 'Create restaurant' })
  @ApiOkResponse({ description: 'Restaurant created successfully.' })
  async create(
    @Body() body: CreateRestaurantDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurants.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('RESTAURANT_UPDATE')
  @ApiBody({ type: UpdateRestaurantDto })
  @ApiOperation({ summary: 'Update restaurant' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRestaurantDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurants.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('RESTAURANT_DELETE')
  @ApiOperation({ summary: 'Delete restaurant' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Restaurant deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.restaurants.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
