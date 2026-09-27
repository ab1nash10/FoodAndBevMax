/**
 * Roles that receive operational notifications.
 *
 * ponytail: only 'Super Admin' and 'Admin' exist in the role master today. Narrow this to the
 * operational roles (Restaurant Manager, Store Manager, Chef) once those are seeded, so a
 * platform administrator is not paged for every GRN.
 */
export const NOTIFY_ROLES = ['Super Admin', 'Admin'];
