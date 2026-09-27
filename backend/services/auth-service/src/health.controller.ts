import { HealthCheckService, Public } from '@aahar/auth';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthCheck: HealthCheckService) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Auth service is healthy.' })
  async check(@Res({ passthrough: true }) response: { status(code: number): unknown }) {
    const health = await this.healthCheck.getHealth('auth-service');

    // Readiness probes read the status code, not the body: a 200 kept a pod that cannot reach
    // the database in rotation.
    if (health.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      data: health,
      message: 'Success',
      success: health.status === 'ok',
    };
  }
}
