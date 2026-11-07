import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PosService } from './pos.service';

/** What a POS route acts on, and where the request carries it. */
export interface TillTarget {
  from?: 'body' | 'param' | 'query';
  kind?: 'billId' | 'counterId' | 'menuId' | 'paymentId' | 'shiftId';
  /** The field's name in the request, when it is not called after its kind (e.g. `id`). */
  name?: string;
  /** Shared with screens outside the POS: checked, and lists narrowed, only from a till. */
  optional?: boolean;
}

export interface TillRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  /** The till's counters, once TillGuard has let a request through from a till. */
  till?: { counterIds: string[]; posDeviceId: string };
}

const TILL_TARGET = 'aahar:till-target';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The POS route needs a till (the browser's X-Till-Key), and only for that till's counters. */
export const RequireTill = (target: TillTarget = {}) => SetMetadata(TILL_TARGET, target);

/** The key a till's browser sends to say which till it is; absent anywhere else. */
export function tillKeyOf(request: Pick<TillRequest, 'headers'>): string | undefined {
  const key = request.headers['x-till-key'];
  return typeof key === 'string' ? key : undefined;
}

/**
 * Lets a POS route through only from a till, and only for that till's counters: what the screens
 * show is enforced here too, so the API alone cannot bill at another counter.
 */
@Injectable()
export class TillGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pos: PosService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const target = this.reflector.get<TillTarget | undefined>(TILL_TARGET, context.getHandler());
    if (!target) return true;

    const request = context.switchToHttp().getRequest<TillRequest>();
    const tillKey = tillKeyOf(request);
    if (target.optional && !tillKey) return true;

    const source = { body: request.body, param: request.params, query: request.query };
    const value =
      target.kind && target.from ? source[target.from]?.[target.name ?? target.kind] : undefined;
    // Not an id at all (or missing): still a till only, and the route's validation then answers
    // 400 as it always did. Every till-target field is a validated UUID downstream.
    const id = typeof value === 'string' && UUID.test(value) ? value : undefined;
    request.till = await this.pos.requireTill(
      tillKey,
      target.kind && id ? { [target.kind]: id } : {},
    );
    return true;
  }
}
