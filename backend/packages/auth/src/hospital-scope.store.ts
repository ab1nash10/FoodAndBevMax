import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';

export interface HospitalScopeContext {
  /** `null` means unrestricted (LocationScope.ALL). */
  allowedHospitalIds: string[] | null;
}

/**
 * Carries the current request's allowed hospitals down to the data layer, so query filtering
 * does not have to be repeated by hand in every service.
 *
 * ponytail: populated with `enterWith` from the guard, which is enough for the request/response
 * model here. If background jobs or queue workers are added later they will have no context, so
 * `getAllowedHospitalIds()` deliberately returns undefined there and the extension leaves their
 * queries alone rather than silently returning nothing.
 */
export const hospitalScopeStorage = new AsyncLocalStorage<HospitalScopeContext>();

export function enterHospitalScope(context: HospitalScopeContext): void {
  hospitalScopeStorage.enterWith(context);
}

export function getAllowedHospitalIds(): string[] | null | undefined {
  return hospitalScopeStorage.getStore()?.allowedHospitalIds;
}

/** Models that carry a hospital_id column and are therefore scopable. */
export const HOSPITAL_SCOPED_MODELS = new Set([
  'Counter',
  'Grn',
  'ItemPrice',
  'Kitchen',
  'KitchenProduction',
  'Location',
  'PaymentMachine',
  'PosDevice',
  'Restaurant',
  'RestaurantMenu',
  'StockBalance',
  'StockLedger',
  'Store',
  'Transfer',
  'TransferAcknowledgement',
]);

/**
 * Models with no hospital_id of their own, scoped through the parent that has one. Without
 * these, a single-location user could list and edit every hospital's store and kitchen items.
 */
const RELATION_SCOPED_MODELS: Record<string, string> = {
  KitchenItem: 'kitchen',
  StoreItem: 'store',
};

/**
 * Masters that are either shared by every location (no hospital) or kept by one. A user sees
 * the shared ones and those of their own locations.
 */
const SHARED_OR_SCOPED_MODELS = new Set(['Employee', 'Item', 'ItemCategory', 'TimeSlot']);

/** The filter a read on `model` gets for a user limited to `allowed`; null leaves it alone. */
export function readScope(model: string, allowed: string[]): Record<string, unknown> | null {
  if (HOSPITAL_SCOPED_MODELS.has(model)) {
    return { hospitalId: { in: allowed } };
  }

  if (SHARED_OR_SCOPED_MODELS.has(model)) {
    return { OR: [{ hospitalId: null }, { hospitalId: { in: allowed } }] };
  }

  const relation = RELATION_SCOPED_MODELS[model];

  return relation ? { [relation]: { hospitalId: { in: allowed } } } : null;
}

const READ_OPERATIONS = new Set([
  'aggregate',
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'groupBy',
]);

/**
 * Prisma client extension that narrows reads on hospital-scoped models to the hospitals the
 * current request is allowed to see. Writes are covered by HospitalScopeGuard, which rejects an
 * out-of-scope hospitalId before it reaches the service.
 */
export const hospitalScopeExtension = Prisma.defineExtension({
  name: 'hospitalScope',
  query: {
    $allModels: {
      $allOperations({ args, model, operation, query }) {
        const allowed = getAllowedHospitalIds();

        if (allowed == null || !READ_OPERATIONS.has(operation)) {
          return query(args);
        }

        const scope = readScope(model, allowed);

        if (!scope) {
          return query(args);
        }

        // AND, not a spread: spreading replaced a caller's own `hospitalId: X` with the whole
        // allowed set, so for a multi-location user "belongs to hospital X" quietly became
        // "belongs to any of my hospitals" in every cross-reference and uniqueness check.
        const next = { ...(args as Record<string, unknown>) };
        next.where = next.where ? { AND: [next.where, scope] } : scope;

        return query(next);
      },
    },
  },
});
