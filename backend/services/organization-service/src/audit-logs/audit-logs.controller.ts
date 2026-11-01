import { CurrentUser, Permissions } from '@aahar/auth';
import type { JwtRequestUser } from '@aahar/auth';
import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

/** What the CSV export uses of Express's response. */
interface StreamResponse {
  end(): void;
  once(event: 'drain', listener: () => void): void;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
}

@ApiBearerAuth('access-token')
@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @Permissions('AUDIT_LOG_VIEW')
  @ApiOperation({ summary: 'Audit rows, newest first, by cursor (at most 200 a page)' })
  @ApiOkResponse({ description: '{ items, nextCursor }' })
  async list(@Query() query: AuditLogQueryDto, @CurrentUser() user: JwtRequestUser | undefined) {
    return {
      data: await this.auditLogs.list(query, user?.allowedHospitalIds ?? null),
      message: 'Success',
      success: true,
    };
  }

  @Get('export')
  @Permissions('AUDIT_LOG_VIEW')
  @ApiOperation({ summary: 'The filtered audit rows as CSV (recorded as an EXPORT)' })
  @ApiOkResponse({ description: 'text/csv' })
  async export(
    @Query() query: AuditLogQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
    @Res() response: StreamResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    // Respects backpressure: a slow download holds the next page instead of buffering it.
    const write = (chunk: string) =>
      new Promise<void>((resolve) => {
        if (response.write(chunk)) resolve();
        else response.once('drain', () => resolve());
      });

    await this.auditLogs.export(query, user?.allowedHospitalIds ?? null, write);
    response.end();
  }

  @Get(':entityName/:entityId')
  @Permissions('AUDIT_LOG_VIEW')
  @ApiOperation({ summary: "One record's history, newest first" })
  @ApiOkResponse({ description: '{ items, nextCursor }' })
  async history(
    @Param('entityName') entityName: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query() query: AuditLogQueryDto,
    @CurrentUser() user: JwtRequestUser | undefined,
  ) {
    return {
      data: await this.auditLogs.list(
        { ...query, entityId, entityName },
        user?.allowedHospitalIds ?? null,
      ),
      message: 'Success',
      success: true,
    };
  }
}
