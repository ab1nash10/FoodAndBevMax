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
import { CreateLegalEntityDto } from './dto/create-legal-entity.dto';
import { ListLegalEntitiesQueryDto } from './dto/list-legal-entities-query.dto';
import { UpdateLegalEntityDto } from './dto/update-legal-entity.dto';
import { LegalEntitiesService } from './legal-entities.service';

// Entities are set up with the locations they belong to, so they share the location permissions.
@ApiBearerAuth('access-token')
@ApiTags('legal-entities')
@Controller('legal-entities')
export class LegalEntitiesController {
  constructor(private readonly legalEntities: LegalEntitiesService) {}

  @Get()
  @Permissions('HOSPITAL_VIEW')
  @ApiOperation({ summary: 'Get legal entities' })
  @ApiOkResponse({ description: 'Legal entities returned successfully.' })
  async list(@Query() query: ListLegalEntitiesQueryDto) {
    return { data: await this.legalEntities.list(query), message: 'Success', success: true };
  }

  @Get(':id')
  @Permissions('HOSPITAL_VIEW')
  @ApiOperation({ summary: 'Get legal entity by ID' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Legal entity returned successfully.' })
  async getById(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.legalEntities.getById(id), message: 'Success', success: true };
  }

  @Post()
  @Permissions('HOSPITAL_CREATE')
  @ApiBody({ type: CreateLegalEntityDto })
  @ApiOperation({ summary: 'Create legal entity' })
  @ApiOkResponse({ description: 'Legal entity created successfully.' })
  async create(
    @Body() body: CreateLegalEntityDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.legalEntities.create(body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Put(':id')
  @Permissions('HOSPITAL_UPDATE')
  @ApiBody({ type: UpdateLegalEntityDto })
  @ApiOperation({ summary: 'Update legal entity' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Legal entity updated successfully.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLegalEntityDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.legalEntities.update(id, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }

  @Delete(':id')
  @Permissions('HOSPITAL_DELETE')
  @ApiOperation({ summary: 'Delete legal entity' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Legal entity deleted successfully.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.legalEntities.remove(id, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
