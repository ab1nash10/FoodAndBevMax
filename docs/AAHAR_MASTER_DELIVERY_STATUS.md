# AAHAR Master Delivery Status

**Status date:** 15 September 2026  
**Evidence reviewed:** Admin Portal routes and components, NestJS controllers/services, Prisma schema and migrations, and all documents in `docs/`.  
**Purpose:** One current delivery register for every implemented, in-progress, and planned AAHAR screen. This document is the delivery-status source of truth; the BRD/FSD describe requirements, the API specification describes contracts, and the prompt plan describes the remaining build sequence.

## 1. How to read this register

| Status                | Meaning                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready for UAT**     | A routable UI and supporting API/database capability exist. It still needs business UAT and regression evidence before production sign-off. |
| **WIP**               | Some foundation exists, but the user journey, UI, business rules, or API is incomplete.                                                     |
| **Future**            | No usable implementation exists yet; it is a planned requirement.                                                                           |
| **Redirect / legacy** | The URL deliberately forwards to a replacement and is not an independent screen.                                                            |

Do not use “Ready for UAT” to mean production-ready. Production readiness additionally requires test evidence, security review, operational monitoring, deployment validation, and business approval.

## 2. Evidence-based platform position

### Implemented foundations

- Next.js admin portal with login, authenticated dashboard shell, RBAC-aware navigation, location context, error/forbidden pages, and shared design system.
- NestJS Auth, User, and Organization services with JWT/OTP flow, RBAC, correlation/audit support, pagination patterns, and health endpoints.
- Prisma has valid models for organisation, item, POS/payment masters, mappings, GRN/batches, kitchen production, transfers/acknowledgements, stock ledger/balances, and audit logs.
- `pnpm exec prisma validate --schema prisma/schema.prisma` passed on 15 September 2026.

### Important reconciliation of older documents

`AAHAR_BOOK.md` still labels Phase 4.6D (POS Device and Payment Machine Master) as pending. The current code contains `PosDevice`, `PosDeviceRestaurant`, and `PaymentMachine` Prisma models; controllers; and the `/masters/pos` management UI. It is therefore **Ready for UAT** in this register.

`AAHAR_PROMPT_PLAN.md` correctly remains the detailed backlog and should be used to finish the stricter business requirements not yet represented by the foundation implementation. A working CRUD screen is not automatically the complete workflow specified in that plan.

## 3. Current screen register — delivered baseline

| Area              | Screen / route                                         | Status              | Evidence and scope                                                                                                                                 |
| ----------------- | ------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | Login and OTP verification `/auth/login`               | Ready for UAT       | Auth UI and Auth Service endpoints for send OTP, verify, refresh, and logout.                                                                      |
| Administration    | Dashboard `/dashboard`                                 | Ready for UAT       | Routed dashboard overview with organisation and inventory quick links. It is a baseline dashboard, not the future operational analytics dashboard. |
| Organisation      | Hospital list and create `/masters/hospitals`, `/new`  | Ready for UAT       | UI, API, Prisma `Hospital`, and migrations present.                                                                                                |
| Organisation      | Hospital locations `/masters/hospitals/[id]/locations` | Ready for UAT       | Location administration is provided in hospital context.                                                                                           |
| Organisation      | Location master                                        | Ready for UAT       | `Location` model and controller exist; standalone `/masters/locations` URLs are compatibility aliases to the hospital experience.                  |
| Organisation      | Store list and create `/masters/stores`, `/new`        | Ready for UAT       | UI, API, Prisma `Store`.                                                                                                                           |
| Organisation      | Kitchen list and create `/masters/kitchens`, `/new`    | Ready for UAT       | UI, API, Prisma `Kitchen`.                                                                                                                         |
| Organisation      | Restaurant list, create, edit `/masters/restaurants`   | Ready for UAT       | UI, API, Prisma `Restaurant` and restaurant-kitchen relation.                                                                                      |
| Master data       | Item categories `/masters/item-categories`             | Ready for UAT       | List/create UI, API, Prisma `ItemCategory`.                                                                                                        |
| Master data       | Items `/masters/items`                                 | Ready for UAT       | List/create UI, API, Prisma `Item`; supports MRP/readymade/live types in the schema.                                                               |
| Master data       | Item prices `/masters/item-prices`                     | Ready for UAT       | List/create/edit UI, API including price resolution, Prisma `ItemPrice`.                                                                           |
| Master data       | Employees `/masters/employees`                         | Ready for UAT       | List/create UI and employee validation API.                                                                                                        |
| Configuration     | Time slots `/masters/time-slots`                       | Ready for UAT       | UI/API/schema base for time availability configuration. Advanced overnight/historic behaviour remains a UAT item.                                  |
| Mapping           | Store-item mapping `/masters/store-items`              | Ready for UAT       | UI/API/schema mapping foundation.                                                                                                                  |
| Mapping           | Kitchen-item mapping `/masters/kitchen-items`          | Ready for UAT       | UI/API/schema mapping foundation.                                                                                                                  |
| Mapping           | Restaurant menu mapping `/masters/restaurant-menus`    | Ready for UAT       | UI/API/schema mapping with active/available, day, and time-slot fields.                                                                            |
| POS configuration | POS device master `/masters/pos`                       | Ready for UAT       | Create/update/delete UI functions, controller/service, and `PosDevice`/restaurant mapping models.                                                  |
| POS configuration | Payment machine master `/masters/pos`                  | Ready for UAT       | Managed alongside POS devices; UI functions, controller/service, and `PaymentMachine` model exist.                                                 |
| Inventory         | GRN list and create `/inventory/grns`, `/new`          | Ready for UAT       | GRN, lines, and batches persist; post-to-stock and cancel endpoints exist.                                                                         |
| Inventory         | Store-stock dashboard `/inventory/store-stock`         | Ready for UAT       | Stock summary/balance API and UI.                                                                                                                  |
| Inventory         | Stock ledger `/inventory/stock-ledgers`                | Ready for UAT       | Ledger API/UI backed by immutable-style `StockLedger` records.                                                                                     |
| Inventory         | Transfers `/inventory/transfers`, `/new`               | Ready for UAT       | Transfer UI/API, dispatch/cancel endpoints, lines, and acknowledgement domain model.                                                               |
| Inventory         | Restaurant stock `/inventory/restaurant-stock`         | Ready for UAT       | Restaurant stock API/UI and stock ledger/balance persistence.                                                                                      |
| Kitchen           | Kitchen productions `/kitchen/productions`, `/new`     | Ready for UAT       | Production UI/API with post/cancel workflow and line records.                                                                                      |
| Kitchen           | Kitchen stock `/kitchen/stock`                         | Ready for UAT       | Kitchen stock and ledger API/UI.                                                                                                                   |
| Access            | User API                                               | Ready for UAT (API) | User CRUD and role assignment endpoints exist; no complete admin UI is present.                                                                    |
| Access            | Role API                                               | Ready for UAT (API) | Role CRUD and permission assignment endpoints exist; no complete admin UI is present.                                                              |
| Access            | Permission API                                         | Ready for UAT (API) | Permission listing endpoint exists.                                                                                                                |

## 4. Current screen register — WIP, placeholder, or legacy

| Area                     | Screen / route                            | Status            | What remains                                                                                                                                                      |
| ------------------------ | ----------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access                   | Users `/users`                            | WIP               | Route is a generic `PageShell`; connect list/create/edit/role assignment UI to the existing User API.                                                             |
| Access                   | Roles `/roles`                            | WIP               | Route is a generic `PageShell`; connect role CRUD and permission assignment UI.                                                                                   |
| Access                   | Permissions `/permissions`                | WIP               | Route is a generic `PageShell`; add searchable permission catalogue and role impact view.                                                                         |
| Reports                  | Audit logs `/reports/audit`               | WIP               | Route is a generic `PageShell`; `AuditLog` persistence exists but no usable explorer/export UI.                                                                   |
| Organisation             | Companies `/masters/companies`            | Redirect / legacy | Redirects to Hospitals. Retire from navigation/docs or specify a real company/tenant model.                                                                       |
| Organisation             | Standalone locations `/masters/locations` | Redirect / legacy | Redirects to the hospital implementation. Keep only as compatibility URL unless an independent location console is required.                                      |
| POS configuration        | Counters `/masters/counters`              | WIP               | Counter API and Prisma model exist, but the routes redirect to `/masters/pos`; create the counter-management UI or explicitly integrate it into POS Master.       |
| Restaurant operations    | Live-item availability                    | WIP               | `RestaurantMenu.isAvailable` exists, but the planned temporary override, reason, effective-to time, and single availability resolver for POS/QR are absent.       |
| Restaurant configuration | Menu mapping advanced rules               | WIP               | Base mapping exists. Add channel/effective-date duplicate prevention, price/date validation, and fully specified time-slot checks.                                |
| Inventory                | GRN procurement depth                     | WIP               | Baseline GRN and batches exist. Purchase-order integration, explicit MRP/tax/cost policy, and all acceptance rules in the prompt plan need confirmation/build.    |
| Inventory                | Stock adjustments and valuation           | WIP               | Ledger and balances exist; authorised adjustment/reversal, quarantine/expiry, reserved/in-transit, and valuation workflows are not evidenced as complete screens. |
| Inventory                | Transfer acknowledgement UI               | WIP               | Domain/API exists. Confirm and complete the operator-facing acknowledgement flow, partial receipts, and FEFO/production traceability acceptance tests.            |
| Kitchen                  | Readymade daily-stock controls            | WIP               | Kitchen production and stock exist; controlled edit/reversal after transfer/sale and daily-stock rules need the prompt-plan workflow.                             |

## 5. Future screen register — full delivery backlog

The following register incorporates every screen named in `AAHAR_PROMPT_PLAN.md` and the major future screens in the FSD/implementation plan. Items that have a baseline in Sections 3–4 remain WIP here until their full stated acceptance criteria are met.

| Delivery group             | Planned screen                                                      | Status |
| -------------------------- | ------------------------------------------------------------------- | ------ |
| POS and configuration      | POS device configuration and device-to-counter/restaurant operation | WIP    |
| Inventory operations       | MRP receipt, batch management, and procurement controls             | WIP    |
| Inventory operations       | Readymade production and daily stock                                | WIP    |
| Restaurant operations      | Live preparation and availability                                   | WIP    |
| Inventory operations       | GRN full workflow                                                   | WIP    |
| Inventory operations       | Stock dashboard, adjustment, expiry/quarantine, valuation           | WIP    |
| Inventory operations       | Transfer and restaurant acknowledgement full workflow               | WIP    |
| Restaurant configuration   | Restaurant menu full validation/effective-date/channel rules        | WIP    |
| Restaurant configuration   | Time-slot edge cases and availability resolver                      | WIP    |
| Restaurant configuration   | Discount rules and approval management                              | Future |
| Ordering channels          | Operator POS order capture                                          | Future |
| Ordering channels          | QR customer ordering                                                | Future |
| Ordering channels          | Employee mobile ordering                                            | Future |
| Billing                    | Billing, tax, invoice finalisation, void/refund                     | Future |
| Kitchen operations         | KOT queue and order-tracker display                                 | Future |
| Operational close          | Shift End                                                           | Future |
| Operational close          | Day End                                                             | Future |
| Payments                   | Payment modes master                                                | Future |
| Payments                   | Payment provider integrations (Pine Labs, Razorpay, PayU, etc.)     | Future |
| Closing and reconciliation | Shift closing workbench                                             | Future |
| Closing and reconciliation | Day closing workbench                                               | Future |
| Closing and reconciliation | Payment reconciliation                                              | Future |
| Closing and reconciliation | Supervisor approval queue                                           | Future |
| Reporting                  | Location-wise reports                                               | Future |
| Reporting                  | Report type master                                                  | Future |
| Reporting                  | Restaurant-wise reports and audit explorer                          | WIP    |
| ERP                        | ERP / SUN export and posting dashboard                              | Future |
| Delivery operations        | Delivery assignment/dashboard                                       | Future |
| Wastage                    | Wastage entry and day-end handling                                  | Future |
| Quality                    | Sandbox, UAT, production-hardening screens/processes                | Future |

## 6. Database readiness boundary

### Present in Prisma

Organisation and access: users, roles, permissions, hospitals, locations, stores, kitchens, restaurants, restaurant-kitchen mapping, counters, POS devices, POS-device restaurant mapping, payment machines, employees, and audit logs.

Catalogue and configuration: item categories, items, item prices, time slots, store items, kitchen items, and restaurant menus.

Inventory: GRNs, GRN lines/batches, kitchen productions/lines, transfers/lines, acknowledgements/lines, stock ledger, and stock balances.

### Not yet modelled for the future operating flow

The schema has no dedicated persisted models for orders/carts/order lines, invoices, KOTs, shifts, payment attempts/settlements/refunds, discount rules/approvals, QR sessions, delivery assignments, wastage transactions, report definitions/runs, ERP export batches, or supervisor approvals. These need schema migrations and APIs before their future screens can be completed.

## 7. Delivery order from this point

1. Finish the WIP closure work: Counter UI, users/roles/permissions, audit explorer, advanced menu/time availability, stock adjustment/acknowledgement, and full GRN/production rules.
2. Add the shared transactional core: business date/shift, order, order-line, tax/discount snapshot, invoice, payment, and immutable event/audit semantics.
3. Deliver operator POS order capture and billing together, then KOT/order tracking.
4. Add QR and employee ordering only after the shared order engine is stable.
5. Add payment integrations, reconciliation, shift/day close, supervisor approvals, wastage, ERP export, and reports in that dependency order.
6. Run UAT and production-hardening before declaring any operational module production-ready.

## 8. Required completion gate for each screen

A screen can move from WIP/Future to Ready for UAT only when all apply:

- The route is permission-protected and supports loading, empty, validation, error, and success states.
- UI, API, DTO validation, Prisma migration/model, audit data, and role permissions are delivered together where persistent data is involved.
- Hospital/location scope and active/inactive rules are enforced server-side.
- Stock, money, and business-date actions are transactional, idempotent where retries are possible, and cannot silently mutate historical records.
- Unit/integration tests, typecheck, lint, migration validation, and the relevant regression checklist pass.
- The BA/product owner has accepted the workflow with representative real data.

## 9. Document map

| Document                                                                           | Use it for                                                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `BRD.md`                                                                           | Business goals, scope, and phase intent.                                   |
| `PRD.md`                                                                           | Product requirements.                                                      |
| `FSD.md`                                                                           | Detailed functional workflows and screen acceptance criteria.              |
| `AAHAR_PROMPT_PLAN.md`                                                             | Build prompts for the outstanding screen backlog.                          |
| `API_SPEC.md`                                                                      | Current API contract reference.                                            |
| `ERD.md` and `prisma/schema.prisma`                                                | Data model reference; schema is the implementation authority.              |
| `IMPLEMENTATION_PLAN.md` and `SPRINT_PLAN.md`                                      | Historic/planned delivery sequencing.                                      |
| `AAHAR_BOOK.md`                                                                    | Project handover context; update its phase summary to match this register. |
| `REGRESSION_CHECKLIST.md`, `PRODUCTION_READINESS.md`, security and deployment docs | Test, release, security, and operational gates.                            |

## 10. Maintenance rule

Update this file in the same pull request as any screen, API, Prisma migration, or status change. Record the route, API/controller, Prisma model/migration, test evidence, owner, and UAT date before moving a row to Ready for UAT or Production Ready.
