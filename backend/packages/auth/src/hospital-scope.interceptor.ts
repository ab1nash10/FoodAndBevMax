import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { hospitalScopeStorage } from './hospital-scope.store';
import type { JwtRequestUser } from './types';

/**
 * Runs the request handler inside the hospital-scope store so the Prisma extension can narrow
 * reads to the caller's locations.
 *
 * This is an interceptor rather than part of the guard on purpose: `AsyncLocalStorage.enterWith`
 * called inside an awaited guard does not reliably survive back into the caller's continuation,
 * so the store read back in the service was empty and every location's rows were returned. An
 * interceptor owns `next.handle()`, so the whole handler can be wrapped in `run()` instead.
 */
@Injectable()
export class HospitalScopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: JwtRequestUser }>();
    const allowedHospitalIds = request.user?.allowedHospitalIds;

    // Unauthenticated, or unrestricted (LocationScope.ALL): nothing to narrow.
    if (allowedHospitalIds === undefined || allowedHospitalIds === null) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      hospitalScopeStorage.run({ allowedHospitalIds }, () => {
        next.handle().subscribe({
          complete: () => subscriber.complete(),
          error: (error) => subscriber.error(error),
          next: (value) => subscriber.next(value),
        });
      });
    });
  }
}
