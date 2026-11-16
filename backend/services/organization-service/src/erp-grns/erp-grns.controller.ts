import { CurrentUser, Permissions, Public } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { getActorId, getIpAddress, type RequestContextLike } from '../common/request-context';
import { ErpGrnRowDto, ListGrnEntriesQueryDto, VerifyGrnEntryDto } from './dto/erp-grn.dto';
import { ErpGrnsService } from './erp-grns.service';
import { ErpSignatureGuard } from './erp-signature.guard';

/** For the ERP only: no user sign-in, every request signed instead (see ErpSignatureGuard). */
@ApiHeader({ name: 'X-Api-Key', required: true })
@ApiHeader({ description: 'India time, dd/MM/yyyy/HH/mm', name: 'X-Timestamp', required: true })
@ApiHeader({ description: 'A new UUID for every request', name: 'X-Nonce', required: true })
@ApiHeader({
  description:
    'Lowercase hex HMAC-SHA256, with the shared secret, of METHOD, path with query, X-Timestamp, ' +
    'X-Nonce and the SHA-256 hex of the body, joined by newlines',
  name: 'X-Signature',
  required: true,
})
@ApiTags('erp-grns')
@Public()
@UseGuards(ErpSignatureGuard)
@Controller('erp/grns')
export class ErpGrnsController {
  constructor(private readonly erpGrns: ErpGrnsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a GRN: a JSON array of its rows, one per batch, all with the same grn_No',
  })
  @ApiBody({ type: [ErpGrnRowDto] })
  @ApiOkResponse({ description: 'GRN saved as PENDING, or replaced while still pending.' })
  async receive(
    @Body(new ParseArrayPipe({ forbidNonWhitelisted: true, items: ErpGrnRowDto, whitelist: true }))
    rows: ErpGrnRowDto[],
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.erpGrns.receive(rows, getIpAddress(request)),
      message: 'Success',
      success: true,
    };
  }

  @Get()
  @ApiOperation({ summary: 'GRNs with what was accepted and rejected, e.g. verified since a time' })
  async list(@Query() query: ListGrnEntriesQueryDto) {
    return { data: await this.erpGrns.list(query), message: 'Success', success: true };
  }

  @Get(':grnNumber')
  @ApiOperation({ summary: 'One GRN: sent, accepted and rejected quantity of every batch' })
  @ApiParam({ name: 'grnNumber' })
  async get(@Param('grnNumber') grnNumber: string) {
    return { data: await this.erpGrns.get(grnNumber), message: 'Success', success: true };
  }
}

/** For the portal: the store team checks each ERP GRN and accepts or rejects every batch. */
@ApiBearerAuth('access-token')
@ApiTags('grn-entries')
@Controller('grn-entries')
export class GrnEntriesController {
  constructor(private readonly erpGrns: ErpGrnsService) {}

  @Get()
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'GRNs sent by the ERP' })
  async list(@Query() query: ListGrnEntriesQueryDto) {
    return { data: await this.erpGrns.list(query), message: 'Success', success: true };
  }

  @Get(':grnNumber')
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'One GRN sent by the ERP' })
  @ApiParam({ name: 'grnNumber' })
  async get(@Param('grnNumber') grnNumber: string) {
    return { data: await this.erpGrns.get(grnNumber), message: 'Success', success: true };
  }

  @Patch(':grnNumber/verify')
  @Permissions('GRN_POST')
  @ApiOperation({ summary: 'Accept or reject every batch; accepted quantity moves store stock' })
  @ApiParam({ name: 'grnNumber' })
  async verify(
    @Param('grnNumber') grnNumber: string,
    @Body() body: VerifyGrnEntryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.erpGrns.verify(grnNumber, body, {
        actorId: getActorId(user),
        ipAddress: getIpAddress(request),
      }),
      message: 'Success',
      success: true,
    };
  }
}
