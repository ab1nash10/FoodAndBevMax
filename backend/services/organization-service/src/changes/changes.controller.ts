import { ChangeRelay, Public } from '@aahar/auth';
import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { IncomingMessage, ServerResponse } from 'node:http';

@ApiTags('changes')
@Controller('changes')
export class ChangesController {
  constructor(private readonly relay: ChangeRelay) {}

  // Public, like the kiosk, QR and order-board menus it refreshes: it carries area names only.
  // One request per screen held open, so the per-address cap in the relay limits it, not the
  // request throttle: a hospital's screens behind one address all reconnect after a deploy.
  @Get()
  @Public()
  @SkipThrottle({ address: true, default: true })
  @ApiOperation({ summary: 'Stream the areas that change, as server-sent events' })
  @ApiOkResponse({ description: 'text/event-stream: `data: ["items"]` after each save.' })
  stream(@Req() request: IncomingMessage & { ip?: string }, @Res() response: ServerResponse): void {
    this.relay.attach(request, response);
  }
}
