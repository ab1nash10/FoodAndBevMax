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
  UseFilters,
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
import {
  CloseGrnEntryDto,
  ErpGrnRowDto,
  ListGrnEntriesQueryDto,
  ListGrnRefusalsQueryDto,
  SetGrnEntryRerunDto,
} from './dto/erp-grn.dto';
import { ErpGrnsService } from './erp-grns.service';
import { ErpRequestFilter } from './erp-request.filter';
import { ErpSignatureGuard } from './erp-signature.guard';

/** For the ERP only: no user sign-in, every request signed instead (see ErpSignatureGuard). */
@ApiHeader({ name: 'X-Api-Key', required: true })
@ApiHeader({ description: 'India time, dd/MM/yyyy/HH/mm', name: 'X-Timestamp', required: true })
@ApiHeader({
  description: 'SHA-512 hex of api_key|GRN|X-Timestamp|token (the token is the shared secret)',
  name: 'X-Signature',
  required: true,
})
@ApiTags('erp-grns')
@Public()
@UseGuards(ErpSignatureGuard)
// Every failure the ERP gets, from any of its calls, in one shape: success false + errors.
@UseFilters(ErpRequestFilter)
@Controller('erp/grns')
export class ErpGrnsController {
  constructor(private readonly erpGrns: ErpGrnsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a GRN: a JSON array of its rows, one per batch, all with the same grn_No',
  })
  @ApiBody({ type: [ErpGrnRowDto] })
  @ApiOkResponse({
    description:
      'Saved and its stock moved (the same grn_No again adds its rows to that GRN): ' +
      '{ transaction_number, message: "We have successfully received the request", success: true }. ' +
      'Refused, and listed on ERP GRN errors: { transaction_number: null, message: "Request ' +
      'failed", success: false, errors: [...] }.',
  })
  async receive(
    @Body(new ParseArrayPipe({ forbidNonWhitelisted: true, items: ErpGrnRowDto, whitelist: true }))
    rows: ErpGrnRowDto[],
    @Req() request: RequestContextLike,
  ) {
    const { transactionNumber } = await this.erpGrns.receive(rows, getIpAddress(request));

    return {
      message: 'We have successfully received the request',
      success: true,
      transaction_number: transactionNumber,
    };
  }

  @Get()
  @ApiOperation({ summary: 'GRNs with what was accepted and rejected, e.g. verified since a time' })
  async list(@Query() query: ListGrnEntriesQueryDto) {
    return { data: await this.erpGrns.list(query), message: 'Success', success: true };
  }

  @Get(':grnNumber')
  @ApiOperation({ summary: 'One GRN: sent, accepted and rejected quantity of every batch' })
  @ApiParam({
    description: 'The grn_No, or the transaction_number AAHAR returned',
    name: 'grnNumber',
  })
  async get(@Param('grnNumber') grnNumber: string) {
    return { data: await this.erpGrns.get(grnNumber), message: 'Success', success: true };
  }
}

/** For the portal: the store team sees each ERP GRN and handles reverses still waiting. */
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

  // Before :grnNumber, which would otherwise take "refusals" as a GRN number.
  @Get('refusals')
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'GRNs the ERP sent that AAHAR refused, with why (ERP GRN errors)' })
  async listRefusals(@Query() query: ListGrnRefusalsQueryDto) {
    return { data: await this.erpGrns.listRefusals(query), message: 'Success', success: true };
  }

  @Get(':grnNumber')
  @Permissions('GRN_VIEW')
  @ApiOperation({ summary: 'One GRN sent by the ERP' })
  @ApiParam({ name: 'grnNumber' })
  async get(@Param('grnNumber') grnNumber: string) {
    return { data: await this.erpGrns.get(grnNumber), message: 'Success', success: true };
  }

  @Post(':grnNumber/run')
  @HttpCode(200)
  @Permissions('GRN_POST')
  @ApiOperation({ summary: 'Run a waiting reverse now: take what the store holds of its batch' })
  @ApiParam({ name: 'grnNumber' })
  async run(
    @Param('grnNumber') grnNumber: string,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.erpGrns.run(grnNumber, actor(user, request)),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':grnNumber/rerun')
  @Permissions('GRN_POST')
  @ApiOperation({ summary: 'Pause or resume a waiting reverse running again by itself' })
  @ApiParam({ name: 'grnNumber' })
  async setRerun(
    @Param('grnNumber') grnNumber: string,
    @Body() body: SetGrnEntryRerunDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.erpGrns.setRerun(grnNumber, body.active, actor(user, request)),
      message: 'Success',
      success: true,
    };
  }

  @Patch(':grnNumber/close')
  @Permissions('GRN_POST')
  @ApiOperation({ summary: 'Close a waiting reverse that cannot finish, with a reason' })
  @ApiParam({ name: 'grnNumber' })
  async close(
    @Param('grnNumber') grnNumber: string,
    @Body() body: CloseGrnEntryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Req() request: RequestContextLike,
  ) {
    return {
      data: await this.erpGrns.close(grnNumber, body.reason, actor(user, request)),
      message: 'Success',
      success: true,
    };
  }
}

const actor = (user: JwtRequestUser | undefined, request: RequestContextLike) => ({
  actorId: getActorId(user),
  ipAddress: getIpAddress(request),
});
