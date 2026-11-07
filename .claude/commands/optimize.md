# ROLE

You are a senior full-stack engineer optimising the AAHAR monorepo (pnpm + Turborepo):
Next.js 15 / React 19 admin portal and NestJS 10 + Prisma services. Make it faster,
smaller and easier to maintain WITHOUT changing behaviour. Work in a loop until every
task is done; don't stop between tasks.

# SETTINGS (the user may edit these lines)

SCOPE: both # frontend | backend | both
SCHEMA_CHANGES: indexes-only # none | indexes-only (additive Prisma migrations only)
DEV_DEPENDENCIES_ALLOWED: yes # test/analysis tools as devDependencies only
E2E_SMOKE: if-possible # run Playwright smoke tests only if a DB + browsers are available

# THE CODEBASE

- Portal: frontend/apps/admin-portal (@aahar/admin-portal), base path /fandb.
  Hotspots: components/inventory/inventory-pages.tsx (~4.3k lines),
  master-data/master-data-pages.tsx (~3.3k), mapping-foundation/mapping-foundation-pages.tsx
  (~2.6k), kitchen/kitchen-pages.tsx, pos/pos-pages.tsx, admin-shell.tsx.
  Query client defaults live in app/providers.tsx.
- Shared: frontend/packages/api-client/src/index.ts (~2.3k lines, one file),
  frontend/packages/types, frontend/packages/ui.
- Services: backend/services/{auth-service, organization-service, user-service}
  (@aahar/_-service). Largest: organization-service src/{transfers, grns, stock,
  restaurants}/_.service.ts and user-service users.service.ts.
- DB: prisma/schema.prisma (shared schema, many @@index already).
- Today there are NO automated tests and NO CI. Every service's "test" script is a
  placeholder.

# NON-NEGOTIABLE RULES

1. Behaviour stays identical: same API routes, request/response shapes, status codes,
   validation messages, permissions, UI flows and copy. If you find a real bug, don't fix it
   silently: log it under "Bugs found" with a failing test, and fix it only in a separate,
   clearly named commit ("fix(...)").
2. No refactor without a test covering it first (characterisation tests are fine).
3. Every optimisation task records a BEFORE and AFTER number in notes/OPTIMIZE-PROGRESS.md. No
   number, no claim.
4. Moving code is separate from changing code: "refactor(...): move X" commits contain
   moves and import updates only.
5. Respect SCHEMA_CHANGES. Never edit existing migrations; new indexes go in a new
   migration with a one-line reason.
6. Keep the design system intact (ds-* tokens, light/dark) and the /fandb base path.
7. Small commits, conventional-commit messages (commitlint is enforced), with
   `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green before each commit.

# TASK QUEUE

## Phase 0: Baseline & safety net

SCHEMA_CHANGES: none

O0 Baseline. Record in notes/OPTIMIZE-PROGRESS.md: `pnpm build` time; Next.js First Load JS per
route (from `next build` output); line counts of the 15 largest source files; lint
warning count; for 6 key endpoints (list transfers, create transfer, acknowledge
transfer, list GRNs, post GRN, store stock) the response time and the number of Prisma
queries per request. Measure queries by enabling Prisma query events behind an env
flag in dev only (e.g. PRISMA_QUERY_LOG=1), never in production.
O1 Test harness. Vitest for each service and for the portal's pure logic, wired into
each package's "test" script so `pnpm test` (turbo) runs everything. Services:
unit tests with a mocked PrismaClient; integration tests against a real database only
if DATABASE_URL_TEST is set (skip cleanly otherwise).
O2 Characterisation tests for money and stock paths before touching them: transfer
create → acknowledge (ACCEPTED_FULL / ACCEPTED_PARTIAL / REJECTED_FULL, stock ledger
entries, reserved/returned qty), GRN verify → post to stock (batches, expiry, accepted
vs rejected), kitchen production post (produced − wastage = accepted), stock balances,
auth login (email+password and OTP happy paths plus a failure). Also the portal's
pure helpers (base path, breadcrumbs/navigation, formatters).
O3 CI: .github/workflows/ci.yml running install (pnpm cache), lint, typecheck, test and
build on pull requests.

## Phase 1: Frontend performance & structure (skip if SCOPE=backend)

O4 Split the mega files by screen without changing logic, e.g.
components/inventory/{grns,transfers,store-stock,stock-ledgers,restaurant-stock}/…
with shared bits in components/inventory/shared/. Same for master-data,
mapping-foundation, kitchen and pos. Target: no component file over ~600 lines.
O5 Split api-client/src/index.ts into domain modules (auth, organization, inventory,
kitchen, users, pos) behind the same public exports, so existing imports keep working.
O6 Data fetching: a query-key factory per domain (lib/query-keys.ts); sensible staleTime
(master data 5 min, lists 30 s, live queues 15 s); `select` to trim data; remove
duplicate and waterfall requests; prefetch on hover for list → detail; keep
lib/query-invalidation.ts correct.
O7 Rendering: memoise expensive derived data and table rows; stable callbacks; debounce
search inputs (250 ms); paginate or virtualise any list rendering 200+ rows; avoid
re-rendering the whole shell on location change.
O8 Bundle: next/dynamic for heavy, rarely used UI (modals, POS screens, big forms,
charts); import icons per icon (lucide-react tree-shaking); check `@aahar/ui` isn't
pulled in whole; remove unused dependencies. Target: First Load JS down on the 5
heaviest routes.
O9 Forms: shared zod schemas from @aahar/types where frontend and backend validate the
same thing; react-hook-form without unnecessary re-renders (no watch() on the whole
form).

## Phase 2: Backend performance & structure (skip if SCOPE=frontend)

O10 Prisma queries: replace broad `include` with explicit `select`; remove N+1 loops
(batch with `in` or a single query); paginate every list endpoint (cursor or
skip/take, capped); wrap multi-write flows in $transaction; use aggregate/groupBy
instead of loading rows to count or sum.
O11 Indexes (if SCHEMA_CHANGES=indexes-only): from the query log, add composite indexes for
the hot filters (e.g. hospitalId + status + createdAt on transfers, GRNs and
productions; itemId + locationId on stock ledgers), then re-measure.
O12 Service structure: split the 650–1000-line services into focused providers (e.g.
transfers: query service, command service, acknowledgement service) behind the same
controller routes; extract repeated pagination, filtering, hospital scoping and
audit-log helpers into src/common.
O13 Caching (read-only, safe): in-memory TTL cache for rarely changing master data lookups
used inside hot paths (items, rate types, time slots), invalidated on write in the
same service. No cross-service cache.
O14 Errors & logging: consistent exception filter, no stack traces in responses, structured
request logs with duration, slow-query warning over 300 ms (dev/staging only).

## Phase 3: Hygiene

O15 Dead code: run knip (or ts-prune) and remove unused exports, files and dependencies,
one area per commit.
O16 Lint & types: remove `any` in touched areas; enable stricter rules only where the
codebase already passes them; zero lint warnings.
O17 Final report (see DONE WHEN).

# LOOP — repeat until every task is [x], [skipped] or [blocked]

1. Open notes/OPTIMIZE-PROGRESS.md. If it doesn't exist, create it with O0–O17 as
   [ ] plus sections "Baseline", "Results (before → after)", "Decisions", "Bugs found",
   "Blocked".
2. Take the first [ ] task allowed by SCOPE. Write a 3–6 line plan: files, risk, how you
   will measure.
3. Make sure tests cover the code you're about to change. If not, write them first.
4. Implement the smallest change that achieves the task.
5. Verify, fixing until green: pnpm lint, pnpm typecheck, pnpm test, pnpm build. Re-run
   the task's measurement and record before → after. If a number got worse, revert that
   change and note why.
6. After 3 failed attempts at the same problem, mark the task [blocked] with the exact
   error and what you tried, and move on.
7. Mark [x] with a 1–2 line summary and commit.
8. Continue with the next task. Ask the user only for changes that would alter an API
   contract, the schema beyond SETTINGS, permissions, or visible behaviour. Otherwise
   choose the safest option and log it under "Decisions".

# DONE WHEN

Every task is [x], [skipped] (outside SCOPE) or [blocked]; CI is green; and
notes/OPTIMIZE-PROGRESS.md shows a before → after table covering build time, First Load JS
per route, largest file sizes, endpoint times and query counts, and test count and
coverage of the stock and money paths. Finish with a short report: biggest wins, bugs
found, blocked items and recommended next steps.
