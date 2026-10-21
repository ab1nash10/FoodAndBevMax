import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, finalize } from 'rxjs';
import { AccessResolver } from './access-resolver';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Clears the cached access after every write, for the services where writes are what change
 * access (auth: sign-out and passwords; users: roles, permissions, locations, disabling). Writes
 * there are rare, so clearing everything is cheaper than tracking which users a change touched,
 * and no write path can be missed. Not for the organization service, whose writes (bills, GRNs)
 * are frequent and never change access.
 */
@Injectable()
export class ForgetAccessOnWriteInterceptor implements NestInterceptor {
  constructor(private readonly access: AccessResolver) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { method } = context.switchToHttp().getRequest<{ method: string }>();

    return READS.has(method)
      ? next.handle()
      : next.handle().pipe(finalize(() => this.access.forget()));
  }
}
