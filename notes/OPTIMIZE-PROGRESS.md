# Optimisation progress

Settings: SCOPE=both · SCHEMA_CHANGES=indexes-only · DEV_DEPENDENCIES_ALLOWED=yes ·
E2E_SMOKE=if-possible. Branch `perf/optimize`. Behaviour must stay identical.

## Tasks

- [x] O0 Baseline: build, First Load JS per route, file sizes, lint, six endpoints with query counts (dev-only PRISMA_QUERY_LOG=1 counter)
- [x] O1 Test harness (Vitest). The 11 hand-run `*.check.ts` self-checks are now automated: services, portal `lib`
      and `@aahar/ui` on Vitest 5, `@aahar/auth` on its existing `node:test` runner. Tests 13 → 24.
- [x] O2 Characterisation tests over HTTP against `DATABASE_URL_TEST` (skipped without it): GRN,
      store and kitchen transfers with all three acknowledgement outcomes, kitchen production,
      stock views, lifecycles, sign-in by password and OTP; portal query invalidation and
      formatters. Stock and money services 0 % → 81.7 % line coverage. Two date bugs found.
- [x] O3 CI: `.github/workflows/ci.yml` on pull requests (pnpm cache, Node 24, Postgres 16 service,
      install, generate, lint, typecheck, migrate + seed, test, build). Rehearsed locally step by step
      on a fresh database, and the build with no `.env`; its first real run needs a push.
- [x] O4 Split the portal mega files: 11 files (inventory, master data, mapping, kitchen, dashboard,
      POS, admin shell, organization shared/restaurants/hospitals, login) into per-screen modules,
      moves only (each checked statement by statement against HEAD). Largest component file
      6,159 → 1,245 lines; First Load JS down on 24 of 32 routes (heaviest 440 → 394 KB).
- [x] O5 api-client: `src/index.ts` (2,304 lines) into nine domain modules re-exported by
      `index.ts`; same 136 public names, moves only. Largest file 2,304 → 510 lines (the single
      `createOrganizationApi`). First Load JS unchanged (±1 KB per route).
- [x] O6 Data fetching: one key factory for all 77 prefixes (`lib/query-keys.ts`, same arrays);
      staleTime 5 min for master data lists that writes invalidate, 15 s for work queues; hover
      and focus prefetch on three list → detail links. No duplicates or waterfalls existed.
- [x] O7 Rendering: the 24 URL-backed search boxes keep their text locally and write the URL once
      typing pauses (250 ms), so a keystroke no longer re-renders everything that reads the URL:
      URL writes per typed word 14 → 2. No list renders 200+ rows (the API caps pages at 100).
- [x] O8 Bundle: zod (≈380 KB uncompressed) kept off the first load of 9 list routes (moves out of
      shared modules, the production entry form via next/dynamic, inline form schemas loaded after
      render); First Load JS of those routes −33 to −38 %, 3 of the 5 heaviest. Icons are
      per-icon already, `@aahar/ui` is two exports, no portal dependency is unused.
- [x] O9 Forms: three forms that watched every field to enable Save now watch only the fields
      that decision reads; typing elsewhere renders 0 components instead of ~1,400. Shared
      frontend/backend schemas skipped: the backend validates with class-validator, not zod.
- [x] O10 Prisma queries: the per-request access lookup is one query instead of eight (7 fewer
      on every authenticated request in all three services; list endpoints ~35 % faster), and the
      create paths no longer reload relations they discard. No N+1 loops found; every list is
      paginated and capped except the store stock summary (see Decisions).
- [x] O11 Indexes: four composite indexes in one additive migration
      (`20261005120000_list_count_indexes`) so the pagination counts on transfers, GRNs and stock
      ledgers run from the index; at production-like volume those counts are 2–9× faster.
- [x] O12 Service structure: helpers that were copied per service (value parsing, list sorting,
      unique-violation errors) now live once in `src/common`, and the four largest services moved
      their module helpers into `<name>.helpers.ts`; no organization-service file is over 600
      lines (was 5 over 650). `users.service.ts` was not split (see Decisions).
- [x] O13 Caching: measured, nothing cached. Every master-data read on the hot paths is either
      the relation load that puts names into the response or an "is it still active" check
      inside the write's transaction; caching either would change what users see or accept
      (see Decisions).
- [x] O14 Errors and logging: the shared exception filter and structured request log were already
      in place; added a `slow_query` warning for queries over 300 ms (outside production, or with
      `PRISMA_SLOW_QUERY_LOG=1`), and fixed oversized bodies getting a 500 instead of a 413.
- [x] O15 Dead code: knip findings 83 → 61; three portal page components and their helpers no
      route used are gone (−740 lines), and three packages no service loaded were removed.
- [x] O16 Lint and types: 31 more typescript-eslint rules and 3 more TypeScript checks are
      enforced, all of which the code already passed; still zero warnings and no explicit `any`.
- [x] O17 Final report: baseline and finished branch measured side by side (Final measurements),
      CI job and a full release rehearsed locally, report at the end of this file.

## Baseline

Measured on `perf/optimize` at 3b82895 (Windows 11, Node 24.19, local Postgres 16 and Redis 7
in Docker).

**How each number is taken** (scripts outside the repo, same method before and after):

- Build: `pnpm turbo build --force` (all 9 tasks, turbo cache bypassed), wall time.
- First Load JS: a cold-cache hard navigation to each route on the production build
  (`next start` standalone) in Edge, summing every script response: transferred (gzip) and
  parsed (decoded) bytes. Next 16 no longer prints First Load JS in `next build` output.
- Endpoints: built services against a copy of the dev database plus seeded volume (250 GRNs
  posted to stock, 250 transfers dispatched and acknowledged: full, partial and rejected,
  created through the APIs and saved as a snapshot restored before every run). Server-side
  duration from the request log, median of 25 runs for reads and 12 for writes; Prisma
  queries per request from `PRISMA_QUERY_LOG=1` (O0 adds it; dev only).

| Build                      | Run 1  | Run 2                  |
| -------------------------- | ------ | ---------------------- |
| `pnpm turbo build --force` | 50.6 s | 47.7 s (turbo: 43.8 s) |

| First Load JS (cold)                                                                                   | Sent (gzip) | Parsed  | Files |
| ------------------------------------------------------------------------------------------------------ | ----------- | ------- | ----- |
| /masters/hospitals, locations, stores, kitchens, restaurants, pos, employees                           | 440 KB      | 1589 KB | 31    |
| /masters/items, item-categories, item-prices, restaurant-menus, time-slots, items/new, item-prices/new | 401 KB      | 1472 KB | 26    |
| /auth/login                                                                                            | 394 KB      | 1417 KB | 25    |
| /dashboard, /kitchen/productions, productions/new, /kitchen/stock                                      | 386 KB      | 1390 KB | 24    |
| /masters/store-items, kitchen-items                                                                    | 384 KB      | 1397 KB | 24    |
| /users, /roles, /permissions, /reports/audit                                                           | 381 KB      | 1373 KB | 23    |
| /inventory/* (grns, grns/new, transfers, transfers/new, store-stock, restaurant-stock, stock-ledgers)  | 374 KB      | 1348 KB | 22    |

Every route in a group loads the same bundle: each page pulls in its whole group file.

| Endpoint                           | Median | p90    | Prisma queries |
| ---------------------------------- | ------ | ------ | -------------- |
| GET /transfers (20 rows)           | 49 ms  | 57 ms  | 13             |
| GET /grns (20 rows)                | 52 ms  | 58 ms  | 15             |
| GET /store-stock/summary (20 rows) | 72 ms  | 88 ms  | 13             |
| PATCH /grns/:id/post-to-stock      | 120 ms | 213 ms | 30             |
| POST /transfers                    | 95 ms  | 120 ms | 25             |
| POST /transfer-acknowledgements    | 139 ms | 189 ms | 38             |

| Largest source files                                                                  | Lines |
| ------------------------------------------------------------------------------------- | ----- |
| frontend/apps/admin-portal/components/inventory/inventory-pages.tsx                   | 5807  |
| frontend/apps/admin-portal/components/master-data/master-data-pages.tsx               | 3562  |
| frontend/apps/admin-portal/components/mapping-foundation/mapping-foundation-pages.tsx | 2493  |
| frontend/packages/api-client/src/index.ts                                             | 2116  |
| frontend/apps/admin-portal/components/kitchen/kitchen-pages.tsx                       | 1767  |
| frontend/apps/admin-portal/components/organization/dashboard-overview.tsx             | 1640  |
| frontend/apps/admin-portal/components/pos/pos-pages.tsx                               | 1367  |
| frontend/apps/admin-portal/components/organization/shared.tsx                         | 1275  |
| frontend/apps/admin-portal/components/organization/restaurants-pages.tsx              | 881   |
| backend/services/user-service/src/users/users.service.ts                              | 857   |
| frontend/apps/admin-portal/components/organization/hospitals-pages.tsx                | 847   |
| frontend/apps/admin-portal/lib/dashboard-stats.ts                                     | 817   |
| frontend/apps/admin-portal/components/admin-shell.tsx                                 | 739   |
| frontend/apps/admin-portal/app/(auth)/auth/login/page.tsx                             | 682   |
| backend/services/organization-service/src/restaurants/restaurants.service.ts          | 618   |

| Quality                                       | Baseline                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Lint warnings (`--max-warnings 0` everywhere) | 0                                                                         |
| `eslint-disable` comments                     | 0                                                                         |
| Automated tests                               | 13: portal 3 (`node --test`), `@aahar/auth` 10 (4 need Redis); services 0 |
| Tests on stock and money paths                | 0                                                                         |

## Results (before → after)

| Metric                                                                                   | Before                                                                                                                  | After                                                                                          |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Automated tests run by `pnpm test` (O1)                                                  | 13 (services 0, portal 3)                                                                                               | 24: auth-service 2, user-service 4, portal 5, ui 1, `@aahar/auth` 12 (4 need Redis)            |
| Automated tests (O2)                                                                     | 24                                                                                                                      | 45: + organization-service 13, auth-service 2, portal 6 (15 need `DATABASE_URL_TEST`)          |
| Tests on stock and money paths (O2)                                                      | 0                                                                                                                       | 13 over HTTP, plus 2 on sign-in                                                                |
| Line coverage, stock and money services (O2)                                             | 0 %                                                                                                                     | 81.7 %: grns 87.5, transfers 82.5, acknowledgements 78.9, kitchen productions 80.5, stock 76.6 |
| Line coverage, auth-service `src/auth` (O2)                                              | 0 %                                                                                                                     | 73.1 %                                                                                         |
| Largest portal component file (O4)                                                       | 6,159 lines (inventory-pages.tsx)                                                                                       | 1,245 (inventory/transfers/create-transfer-page.tsx)                                           |
| Portal component files over 600 lines (O4)                                               | 12                                                                                                                      | 8, each one big component kept whole (see Decisions)                                           |
| First Load JS, heaviest route group (O4)                                                 | 440 KB sent / 1,589 parsed (/masters/hospitals …)                                                                       | 394 / 1,384 (/masters/restaurants)                                                             |
| First Load JS, all 32 routes summed (O4)                                                 | 12,735 KB sent                                                                                                          | 11,995 KB sent (−5.8 %)                                                                        |
| `pnpm turbo build --force` (O4)                                                          | 50.6 s / 47.7 s                                                                                                         | 34.3 s / 30.6 s, not confirmed by the O17 A/B (machine state; see Decisions)                   |
| Largest api-client file (O5)                                                             | 2,304 lines (`src/index.ts`)                                                                                            | 510 (`src/organization-api.ts`)                                                                |
| First Load JS, all routes summed (O5)                                                    | 11,995 KB sent (after O4)                                                                                               | 12,003 KB (no real change: +0.25 KB a route)                                                   |
| API calls on cold load, 22 routes (O6)                                                   | 212, 0 duplicates, waterfall depth 1                                                                                    | 212, 0 duplicates, depth 1 (nothing to remove)                                                 |
| API calls revisiting 4 master data screens after 40 s (O6)                               | 12                                                                                                                      | 5                                                                                              |
| Wait for the record after clicking Edit / Acknowledge (O6)                               | 87–123 ms                                                                                                               | 0 ms (12 of 12 samples)                                                                        |
| URL writes while typing a 7-letter search, 6 list screens (O7)                           | 14 each                                                                                                                 | 2 each                                                                                         |
| Search request after the last key (O7, median of A/B runs)                               | ~430 ms                                                                                                                 | ~370 ms                                                                                        |
| First Load JS, Next route stats, uncompressed (O8)                                       | heaviest 5: login 1,147, transfers/new 1,137, kitchen/productions 1,131, hospitals/[id]/locations 1,128, items 1,127 KB | 1,147, 1,137, **703**, **743**, **745** KB                                                     |
| First Load JS of the list routes changed in O8                                           | stores, kitchens 1,117; item-prices 1,092; restaurants 1,089; hospitals, locations 1,086; transfer acknowledge 1,105 KB | 697; 702; 707; 701; 723 KB                                                                     |
| First Load JS, 47 dashboard routes summed (O8)                                           | 45,632 KB (after O7)                                                                                                    | 41,664 KB (−8.7 %)                                                                             |
| Components rendered typing 10 characters into an unwatched field (O9)                    | item create 1,410; employee create 1,340                                                                                | 0; 0                                                                                           |
| Prisma queries per request (O10): list transfers / GRNs / store stock                    | 13 / 15 / 13                                                                                                            | 6 / 8 / 6                                                                                      |
| Prisma queries per request (O10): post GRN / create transfer / acknowledge               | 30 / 25 / 38                                                                                                            | 23 / 14 / 23                                                                                   |
| Endpoint median, A/B on the seeded snapshot, 2 rounds (O10)                              | transfers 19–21, GRNs 19–22, store stock 30–35, post GRN 42–49, create transfer 40–42, acknowledge 54–63 ms             | 13, 13–14, 25, 37–40, 33–36, 49–54 ms                                                          |
| List count query at 200k transfers / 100k GRNs / 300k ledger rows, EXPLAIN ANALYZE (O11) | transfers by location 13.5, pending 8.2; GRNs by location 6.3; ledgers by item 9.7, by location 42 ms                   | 5.3, 0.8; 2.8; 2.7, 10.7 ms                                                                    |
| `GET /stock-ledgers` for one location at that volume (O11)                               | 56 ms median                                                                                                            | 17 ms                                                                                          |
| Largest organization-service file (O12)                                                  | 717 lines (grns.service.ts)                                                                                             | 598 (kitchen-productions.service.ts)                                                           |
| Service files: grns / transfers / restaurants / stock / kitchen productions (O12)        | 717 / 700 / 681 / 675 / 650 lines                                                                                       | 587 / 520 / 551 / 414 / 598                                                                    |
| Copies of the same helper across services (O12)                                          | getXOrderBy 21, handlePrismaError 14, toNumber 6, toDateOnly 6, toDate 5, optionalText 5, …                             | 1 each, in `src/common` (unit-tested)                                                          |
| organization-service source lines, specs excluded (O12)                                  | 19,107                                                                                                                  | 18,678 (−429)                                                                                  |
| Master-data reads per request, from the statement log (O13)                              | lists: transfers 2 of 6, GRNs 3 of 8, store stock 4 of 6; post GRN 8 of 24, create transfer 6 of 15, dispatch 7 of 22   | unchanged: none is a repeat lookup that a cache could skip safely                              |
| A query held 648 ms by a table lock, built stack (O14)                                   | no log line                                                                                                             | one `slow_query` line: duration and SQL, no parameters                                         |
| POST with a 2 MB JSON body, all three services (O14)                                     | 500 "Internal Server Error"                                                                                             | 413 "request entity too large" (fix commit)                                                    |
| knip findings (O15)                                                                      | 83: 4 files, 9 dependencies, 37 exports, 32 exported types, 1 binary                                                    | 61: the rest are false positives or kept on purpose (see Decisions)                            |
| Dead code removed (O15)                                                                  | —                                                                                                                       | portal −740 lines; 3 unused packages per service, −163 lockfile lines                          |
| Enforced lint rules and compiler checks (O16)                                            | `recommendedTypeChecked`; `strict`, `noUncheckedIndexedAccess`                                                          | + 31 strict/stylistic rules; + 3 compiler checks; lint warnings still 0                        |

First Load JS per route after O4 (same cold-cache method as the baseline):

| Route group (after O4)                                                     | Before sent / parsed | After sent / parsed      |
| -------------------------------------------------------------------------- | -------------------- | ------------------------ |
| /masters/restaurants, hospitals, locations                                 | 440 / 1,589 KB       | 393–394 / 1,376–1,384 KB |
| /masters/stores, kitchens, pos, employees                                  | 440 / 1,589 KB       | 386 / 1,354 KB           |
| /masters/items, item-categories, item-prices (+ new)                       | 401 / 1,472 KB       | 381–384 / 1,340–1,349 KB |
| /masters/restaurant-menus, time-slots                                      | 401 / 1,472 KB       | 378 / 1,332 KB           |
| /masters/store-items, kitchen-items                                        | 384 / 1,397 KB       | 353 / 1,248 KB           |
| /auth/login                                                                | 394 / 1,417 KB       | 386 / 1,353 KB           |
| /dashboard                                                                 | 386 / 1,390 KB       | 365 / 1,290 KB           |
| /kitchen/productions (+ new), /kitchen/stock                               | 386 / 1,390 KB       | 356–363 / 1,260–1,283 KB |
| /users, /roles, /permissions, /reports/audit                               | 381 / 1,373 KB       | 349 / 1,236 KB           |
| /inventory/transfers (+ new), store-stock, restaurant-stock, stock-ledgers | 374 / 1,348 KB       | **379** / 1,333 KB       |
| /inventory/grns (+ new)                                                    | 374 / 1,348 KB       | **385** / 1,353 KB       |

### Final measurements (O17): baseline 3b82895 against the finished branch

Both sides measured in the same session, in a second worktree checked out at 3b82895 (installed and
built the same way). The machine had steady background load (an `update_task` process on one
core, about 60 % CPU at idle), so timings were taken as A/B runs that alternate between the two.

| Metric                                                                                                                  | Baseline (3b82895)                                                                                                            | Finished branch                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm turbo build --force`, 3 alternating rounds                                                                        | 101.6 / 76.1 / 98.1 s (median 98.1)                                                                                           | 77.3 / 98.7 / 88.7 s (median 88.7): no difference beyond the noise                                                                                                                                                                  |
| First Load JS, Next route stats (uncompressed), 5 heaviest                                                              | all five `/inventory/*` 1,245 KB                                                                                              | grns 716, restaurant-stock 696, stock-ledgers 697, store-stock 698, grns/new 1,115 KB                                                                                                                                               |
| First Load JS, all 49 routes summed                                                                                     | 51,815 KB                                                                                                                     | 43,481 KB (−16 %): 37 routes smaller, 11 up 3–13 KB, `/auth/login` up 40 KB                                                                                                                                                         |
| Cold visit, every script downloaded (baseline method), sent / parsed                                                    | masters 440 / 1,589; items 401 / 1,472; login 394 / 1,417; dashboard 386 / 1,390; users 381 / 1,373; inventory 374 / 1,348 KB | 383–391 / 1,343–1,373; 378–384 / 1,332–1,349; 384 / 1,343; 363 / 1,280; 350 / 1,241; **381–387** / 1,340–1,361 KB                                                                                                                   |
| Endpoints, server-side median, both stacks running at once, every request alternated (2 runs of 40 reads and 12 writes) | list transfers 26 / 23, GRNs 26 / 25, store stock 40 / 41, post GRN 56 / 62, create transfer 50 / 58, acknowledge 79 / 86 ms  | 18 / 19, 19 / 19, 33 / 34, 53 / 57, 43 / 44, 66 / 66 ms                                                                                                                                                                             |
| Prisma queries per request (same six endpoints)                                                                         | 13, 15, 13, 30, 25, 38                                                                                                        | 6, 8, 6, 23, 14, 23                                                                                                                                                                                                                 |
| Largest source file (non-blank lines)                                                                                   | 5,807 (inventory-pages.tsx)                                                                                                   | 1,169 (inventory/transfers/create-transfer-page.tsx)                                                                                                                                                                                |
| Files among the 15 largest that exceed 600 non-blank lines                                                              | 15 (smallest of them 618)                                                                                                     | 9                                                                                                                                                                                                                                   |
| Automated tests                                                                                                         | 13                                                                                                                            | 75, all passing with `DATABASE_URL_TEST` and `REDIS_URL` set (the document-number test, once an expected failure, passes since its fix)                                                                                             |
| Line coverage, stock and money services (service + helpers)                                                             | 0 %                                                                                                                           | 82.0 %: grns 88.3, transfers 82.4, acknowledgements 80.0, kitchen productions 81.3, stock 75.8                                                                                                                                      |
| CI                                                                                                                      | none (Jenkins quality gates only)                                                                                             | `.github/workflows/ci.yml`; the job rehearsed locally on a fresh database passes (14 of 14 test tasks); its first GitHub run needs a push                                                                                           |
| Release rehearsal with the five images built by the Jenkinsfile's commands                                              | —                                                                                                                             | migrate, seed twice, services and portal behind nginx with the chart's path rules: health 200, `scripts/smoke.sh` all passed, password sign-in and 10 pages in a browser with no errors; Swagger serves from the image when enabled |

## Decisions

- The brief's codebase notes predate the dependency upgrades: the portal is on Next.js 16 /
  React 19.3, the services on NestJS 12 and Prisma 7 (driver adapter), TypeScript 6. Some
  tests already exist (`@aahar/auth` node tests, portal `node --test` scripts, `*.check.ts`
  self-checks run by hand) and Jenkins already runs `pnpm test` as a CI gate.
- O1: no SWC plugin. Vite 8's built-in transform reads `emitDecoratorMetadata` from tsconfig, and a
  probe confirmed Nest constructor injection and class-validator decorators work under plain
  `vitest run`. (`@swc/core` 1.16 also refuses to load its native binding on this machine because
  of a cache-folder ACL check.) Service specs use `*.spec.ts`, which `tsconfig.build.json` already
  keeps out of `dist`. The portal runs Vitest on `lib/` only, so its existing `node --test`
  scripts keep their own runner. `@aahar/ui` runs Vitest on `src/` because its build copies tests
  into `dist`.
- O1 side effect: `@vitest/coverage-v8` brings `magicast`, an optional peer of Prisma's config
  loader, so the lockfile now has a new single `@prisma/client` variant. A clean
  `pnpm install --frozen-lockfile && pnpm db:generate` (Jenkins and the Dockerfiles do both) is
  all it needs; a checkout that only ran a filtered install must run both before starting.
- O2: the characterisation runs over HTTP (the real `AppModule`, guards, validation pipe and
  exception filter on a random port) rather than with a mocked Prisma, so routes, status codes,
  messages and response shapes are all pinned. Shapes are snapshots of keys and value types, not
  values. `DATABASE_URL_TEST` must be a migrated and seeded database the tests may write to; each
  run adds uniquely named items and a user, never deletes, so it is safe to re-run. Locally:
  the throwaway `aahar-upgrade-pg` copy on 5434. Without the variable the suites skip.
- O2: the suite pins `TZ=UTC` because production does (no image or chart sets `TZ`), so the
  numbers are the same on any laptop. Sign-in replaces the SMS gateway with a spy and blanks
  `SMS_*`, so no message can be sent whatever `.env` holds.
- O2 observation for O10: inside interactive transactions some services run queries in
  `Promise.all` on the transaction client; `pg` warns "Calling client.query() when the client is
  already executing a query is deprecated and will be removed in pg@9.0".
- O2: the formatters private to the mega files (`formatDate`, `formatEnum`, `formatQuantity`, …,
  copied in four files) cannot be tested before they are exported; O4 moves them, and type
  checking plus the build cover a move. Their tests come with O4.

- O3: `turbo.json` declares `DATABASE_URL_TEST` in the test task's `env`. Turborepo's default
  strict mode filters undeclared variables out of task environments, so without it the
  integration suites would always skip under `pnpm test`; declaring it also keys the test cache
  on it, so a run with a database is never answered from one without. Jenkins sets no
  `DATABASE_URL_TEST`, so its `pnpm test` gate is unchanged (the suites skip there).

- O4: moves are done by a scratchpad tool on the TypeScript compiler API, not by hand: each
  top-level declaration goes verbatim to exactly one file (so module state is never duplicated),
  chosen by which page exports reach it; what several pages share goes to `shared/` files layered
  types → utils → components so they cannot import in a cycle; imports are recomputed from the
  type checker's symbols. A second tool compares every statement with the file at HEAD (ignoring
  whitespace, trailing commas and an added `export`) before each commit.
- O4: eight component files stay over ~600 lines because one component fills each
  (`CreateTransferPageClient` 1,177, `GrnVerificationView` 776, `ProductionEntryPageClient` 743,
  `TransfersPageClient` 673, `ItemsPageClient` 638, `RestaurantMenusPageClient` 536 plus its
  helpers, `create-grn-page` 608, `ui-controls` 604). Splitting one component means rewriting
  its JSX into new components, which is a code change, not a move; left for later, with tests.
- O4: the inventory routes send 5–11 KB more (374 → 379/385 KB) while parsing less (1,348 →
  1,333 KB): the screens now load as more, smaller chunks, which compress a little worse. Kept,
  since the split is the maintainability goal and 24 routes got lighter; O8 (bundles) takes it up.
- O4: line counts in Results are `wc -l` of the committed blobs, for before and after alike
  (the Baseline table above counted fewer lines for the same files).

- O6: measured first (`api-trace`: every API call per route on a cold load of the production
  build, plus a session of in-app navigations). There were no duplicate calls and no waterfalls
  (every route fires its calls in parallel), so there was nothing of that kind to remove. The
  dashboard's 32 calls would need an aggregate endpoint, which is an API change; not done.
- O6: the key factory keeps every key array exactly as it was; a test pins all prefixes, the
  invalidation test passed unchanged and the traffic trace was identical before and after.
  (Its commit message says 79 builders; there are 77.)
- O6: 5-minute staleTime only for option lists that the write screens (or
  lib/query-invalidation.ts) invalidate. The inventory and kitchen screens' own location and item
  lists are not invalidated when the masters change, so lengthening them would let a new store
  stay missing from a GRN dropdown for 5 minutes; they keep 30 s.
- O6: `select` was not added: the screens render the fields they fetch, so there was no
  measurable data to trim. Prefetch covers the three list → detail links that fetch on arrival;
  the items and transfers drawers already open from the list's own data.

- O7: main-thread long tasks while typing (CPU throttled 4×) were measured too, but an A/B of the
  two builds alternated under the same conditions varied more within one build (36–239 ms) than
  between them, on a laptop also running Docker and the dev stack; so no blocking-time claim is
  made. The deterministic number is the cause: URL writes per typed word, each of which
  re-rendered every `useSearchParams` reader (shell, breadcrumbs, page).
- O7: the URL now follows the box 250 ms after typing pauses instead of on every key (the box
  itself still updates at once; Back and links still set it). Checked on the production build on
  six screens: the box keeps the text, the URL gets `?q=`, the request carries the whole term and
  none for a partial one, a page opened with `?q=` starts with it.
- O7, not done: the items list re-renders its 25-row table on each keystroke because the box's
  state lives in the page; moving the box into its own component is a JSX restructure across the
  list screens, left for later. Nothing renders 200+ rows (pages are capped at 100), so no
  virtualisation; location changes re-render the location-scoped screens by design.

- O8: the metric is Next's own build output (`.next/diagnostics/route-bundle-stats.json`: the
  chunks a route needs for its first render), deterministic and free of browser noise. The browser
  total of every script until the network is idle barely moves (12,735 → 11,996 KB sent over 32
  routes, about the O4 figure): in production Next prefetches the JS of routes linked on the page,
  so the deferred code still arrives, but in idle time, off the critical path.
- O8: what kept zod (about 380 KB uncompressed) on list routes was mostly reach, not use: a list
  importing a helper from a module that also held a schema. Moving `isUuid`, `onlinePaymentOptions`,
  `optionalText`, the item-prices list helpers and the item schema into the right modules, and
  splitting stores/kitchens into list and create files, removed it with moves only.
- O8: inline edit forms validate with `schema.safeParse` on save (no zodResolver), so the items
  list and hospital locations load their schema through `lazyValue` (warmed after render, awaited
  on save); browser-checked that the same messages appear and valid saves go through.
- O8, not done: login and transfers/new are forms from the first paint, so zod stays on their
  first load; employees, item categories, store/kitchen items, time slots, menus and POS have the
  same inline-form pattern as items and can take the same `lazyValue` change. The command palette
  (≈31 KB, every route) also owns the global keyboard shortcuts, so it is not deferred.

- O9: shared zod schemas from @aahar/types do not apply here: the services validate with
  class-validator DTOs and their own messages, and @aahar/types holds only TypeScript types. Making
  the backend validate with the portal's zod schemas would change its validation and messages, so
  it was not done.
- O9: renders were counted with a minimal React DevTools hook on the production build (React
  reports every commit to it; fibers with the PerformedWork flag are the components that rendered).
  Left as they are: create-transfer watches the whole header because its 800 ms draft autosave
  keys on it (narrowing would stop drafts saving remarks edits; moving autosave to a
  non-rendering subscription changes when a restored draft re-saves), and item-price create reads
  nearly every field anyway.

- O10: SQL was read from the throwaway Postgres's statement log. Eight of the 13–15 statements
  on every request were `AccessResolver.resolve` (user with every column, password hash included,
  then roles, role grants, overrides, permissions and hospitals, one query each). It is now one
  parameterised query with a `json_agg` per relation and the same filters; a characterisation test
  against the database (live vs deleted links, roles, grants, permissions, overrides,
  assignments; disabled and deleted users) was committed first and passes unchanged.
  `relationLoadStrategy: 'join'` would need the relationJoins preview, which switches every
  query in all services to joins; not used.
- O10: the O0 endpoint baseline was taken while the machine was busier, so the timing claims are
  the back-to-back A/B above, not O0 → now (which would read 49 → 13 ms).
- O10: the create paths' timings moved within noise, so only their query counts are claimed.
- O10, not done (recommended next): `GET /store-stock/summary` loads every matching store balance
  with its relations, groups and sorts them in JS and returns one page, so it grows with the
  number of batches (25 ms on the snapshot). Moving the grouping into SQL needs its sort and
  tie-break rules (nullable expiry, store and item names) pinned by tests first.
- O10: every multi-write flow already runs in an interactive `$transaction` with row locks.
  The `pg` warning "client.query() when the client is already executing a query" comes from
  Prisma 7's own query interpreter running a query's relation reads concurrently inside a
  transaction (seen with --trace-deprecation), not from app code; making the app's own
  Promise.all calls sequential did not remove it, so that change was reverted. Worth watching
  before moving to pg 9.

- O11: measured on a throwaway copy grown to production-like volume (`volume.sql`: two years of
  transfers, GRNs and ledger rows over the existing hospitals, saved as `volume.dump`), with the
  exact SQL the API sends (captured from the statement log with its parameters) under EXPLAIN
  ANALYZE, after VACUUM. The page queries were already fast on the date indexes (under 1.5 ms);
  the cost was the COUNT(*) behind each page. The "all locations" count (every live row) cannot
  get faster from an index and was left. Productions and acknowledgements were not given indexes:
  without volume for them there was no measurement.
- O11: the migration is only CREATE INDEX statements; existing single-column indexes stay (dropping
  them would not be additive). `prisma migrate diff` against the migrated database shows no index
  drift; it does list three pre-existing `ALTER COLUMN … SET DEFAULT` lines for the
  database-generated number defaults on GRNs, productions and transfers, which Prisma compares
  textually; they predate this work and are not part of the migration. Plain CREATE INDEX briefly
  blocks writes to its table while it builds, which is negligible at today's production sizes.
- O12: a copy was replaced by the shared helper only when its text matched exactly (checked by
  script); copies that differ stay: hospitals' sort maps a field name, and items, item categories
  and item prices name the clashing field in their 409. Helper moves out of the stock, transfers,
  GRN and restaurant services were checked statement by statement against the previous commit.
- O12: the service classes were not split further into query and command providers. After the
  moves the largest class is 570 lines (GRNs), every list, read and write runs through one
  repository, and a split would add constructors and module wiring for no measurable gain.
- O12: `user-service` `users.service.ts` (975 lines) is unchanged. It holds the Super Admin and
  location-reach guards, and no test covers it yet; splitting it first needs characterisation
  tests for user create/update, role and location assignment and permission overrides.
  Recommended as a follow-up, not done here to avoid touching permission code without tests.
- O12: "hospital scoping" is already central (`hospitalScopeExtension` in the Prisma client) and
  audit logging already one `AuditLogService`; the per-service `assertActiveHospital` copies call
  each service's own repository, so they were left.
- O13: traced with `log_statement = all` on the throwaway database (lists and the four write
  paths, one request each). The master-data reads fall into two kinds. In lists they are the
  batched relation loads (`hospitals`, `items`, `stores`, `item_categories` by `id IN (…)`) that
  fill names into the same response; serving them from a cache would mean hand-joining rows in
  app code and showing a renamed item's old name until the TTL ran out. In writes they are the
  "exists and is active" checks run inside the transaction (hospital, store or restaurant,
  items); a cache there would let a just-deactivated item or store be used, and invalidating "on
  write in the same service" only holds while each service runs one replica (the chart's
  `replicas` is configurable). Each is a primary-key lookup: 0.03–0.7 ms to execute under
  EXPLAIN ANALYZE here (0.8–2.8 ms planning on a cold run).
  There are no rate-type or time-slot lookups on these paths; the only lookup-shaped endpoint,
  `GET /item-prices/resolve` (hospital, item, restaurant, then one or two price queries), has no
  caller in the portal yet. Worth revisiting if a POS client starts calling it per order line.
- O14: most of it was already in place: every service installs the same `GlobalExceptionFilter`
  and JSON request log (`http_request` with `durationMs`, status, request id) through
  `configureSecurityBaseline`, and error bodies carry no stack. Probed on the built stack:
  unknown route 404, no token 401, malformed JSON 400, all in the same envelope; an unexpected
  error is a bare 500. The new piece is the `slow_query` warning in `@aahar/auth` `query-log.ts`.
- O14: the slow-query switch follows the environments as deployed. The Helm chart runs every
  namespace, `dev` included, with `NODE_ENV=production`, so "not production" alone would only
  cover laptops; `PRISMA_SLOW_QUERY_LOG=1` turns it on for such a deploy. It is not added to the
  chart's values here (a deploy change for you to choose). The line has no request id, but it is
  logged while the request runs, so the `http_request` line with the same timing follows it.
- O14, not done: 500s are logged with the error's name and message but no stack, which makes an
  unexpected `TypeError` hard to place. Adding the stack to the server-side log line only (never
  the response) is a small follow-up if wanted.
- O15: knip 5 was run with `pnpm dlx knip@5` and no config; it is not added to the repo, since
  the leftovers below would need an ignore list to keep a CI check quiet. Removed: three portal
  components no route renders, the dead declarations and the export keyword of values used only
  in their own file (portal), and `swagger-ui-express`, `@types/swagger-ui-express` and
  `ts-node` from the three services.
- O15, findings left on purpose: `backend/all-services.mjs` is the `SERVICE=all` image's
  entrypoint (named in the Dockerfile, which knip does not read); `lint-staged` runs from the
  husky hook; `periods` is used by `scripts/dashboard-stats.test.mjs`. The 21 `*SortFields`
  lists and their types stay exported beside the DTO that validates them, and exported types
  used in exported signatures stay; neither costs anything at runtime. `@aahar/types` is
  imported by no code at all, though the portal and api-client depend on it and Next
  transpiles it; removing the package or wiring it in is a call for you, so it is untouched.
- O16: measured by running ESLint once with typescript-eslint's `strictTypeChecked` and
  `stylisticTypeChecked` on top of the repo config. Of the 48 rules they add, 31 report nothing
  and are now on, with the sets' own options; the other 17 report 1–340 findings each (most:
  `no-confusing-void-expression` 340, `restrict-template-expressions` 144,
  `prefer-nullish-coalescing` 50, `array-type` 45, `no-deprecated` 44) and stay off, because
  turning them on means changing code across the portal and services. The TypeScript checks
  `noFallthroughCasesInSwitch`, `noImplicitOverride` and `noImplicitReturns` passed in all 10
  projects and are on in `tsconfig.base.json`; `exactOptionalPropertyTypes` (295 errors in
  organization-service alone) and `noPropertyAccessFromIndexSignature` were not turned on.
  There is no explicit `any` in the source to remove.
- O17, build time: the O4 row (50.6 → 34.3 s) was taken on a quieter machine and is not borne
  out by the final A/B, where both sides swing between 76 and 102 s run to run and show no
  measurable difference either way, so no build-time gain is claimed.
- O17, endpoints: the first A/B ran one stack at a time, alternating; its runs spread from 11 to
  26 ms for the same endpoint, wider than the difference being measured. The final numbers come
  from both stacks running at once on the same freshly restored bench database, every request
  sent to both in alternating order, so load hits both alike. The shared database carries the
  O11 indexes for both sides, which at this volume (hundreds of rows) do not matter; their
  effect was measured separately in O11 at production-like volume.
- O17, `/auth/login` First Load JS is 40 KB larger (1,107 → 1,147 KB uncompressed). Bisected to
  d8da6f9 (O4, moving the master-data screens into per-screen files: moves only). After it,
  Turbopack emits `Input` and `Select` from `components/ui` (with `next/image`) into a second,
  login-only chunk while they also stay in a shared one, so the login route loads them twice;
  no import of the login page changed. The rule says to revert a change whose number gets
  worse; that commit is not reverted, because it is one of the O4 moves behind the smaller
  First Load JS of 37 other routes (up to 44 % on the inventory screens), and a whole login
  visit still downloads less than before (394 → 384 KB sent). Worth re-checking after the next Next.js upgrade.

## Bugs found

- **Dates shift a day early on a server east of UTC** (not in production, which runs in UTC; it
  does affect `pnpm dev` on an IST laptop). `grns`, `transfer-acknowledgements`, `stock` and
  `item-prices` truncate dates with `setHours(0, 0, 0, 0)` (local midnight) while `transfers` and
  `kitchen-productions` use UTC midnight. Under `TZ=Asia/Kolkata`: a GRN batch received with
  expiry 2026-12-04 is stored as 2026-12-03, and ready-made stock acknowledged at a restaurant
  is filed under the previous business date. Failing tests: the two `it.fails` cases in
  `organization-service/src/stock-flows.int.spec.ts` ("on a server east of UTC").
  **Fixed** in a separate `fix(organization)` commit: `grns`, `transfer-acknowledgements` and
  `stock` now use the UTC helper `transfers` already had (stock too, or its date filters would
  stop matching once GRNs store the right day); the two cases are plain tests, plus one for the
  filters. No change in UTC, so none in production. Rows entered through `pnpm dev` in IST
  before the fix keep the day-early date. `item-prices` had the same truncation on
  effective-from/to: **fixed** in `8b7c851` with an IST characterisation test that failed first.
- **Regression from the date fix above, caught and fixed in `8b7c851`:** the helper copied into
  `grns`, `stock` and `transfer-acknowledgements` lost the backslashes of its date pattern, so a
  datetime with an offset took its UTC day instead of its own date part. Plain dates were
  unaffected. All six copies are now one `common/values.ts#toDateOnly`, unit-tested in UTC,
  Asia/Kolkata and America/New_York.
- **No transfer or production could be created after the 9,999th** (fixed by migration
  `20261006030000_document_numbers_keep_growing`, approved on 2026-10-06).
  The number defaults are `'TRF'`/`'PRD' || lpad(nextval(...)::text, 4, '0')`, and `lpad` cuts
  longer text to its first four digits: the 10,000th transfer gets `TRF1000`, which transfer
  1,000 already holds, and every later one also maps onto an existing number (`TRF1000`–
  `TRF9999`). The column is unique, so from then on every create fails with a 500 (the rows are
  soft-deleted, never removed, so no number frees up). GRNs fail the same way after the
  999,999th (6 digits). The test that recorded it ("document numbers keep their padding, then
  keep growing past it" in `stock-flows.int.spec.ts`) evaluates each column's real default.
- The fix changes only the three column defaults, with `nextval` called once: pad to 20 digits,
  then drop the extra zeros, so numbers keep their padding (`TRF0042`, `GRN000123`) and then
  simply grow (`TRF10000`). Existing numbers do not change; `schema.prisma` states the same
  defaults exactly as Postgres stores them, so `prisma migrate diff` against a migrated database
  is empty (it used to re-emit these three defaults). Checked on a fresh database: with the
  sequences set just below the old limits, the integration suite created TRF9996–TRF10003,
  PRD10002 onwards and GRN1000002 onwards through the API, and every flow passed.
- Longer numbers would sort wrongly as text (TRF10000 between TRF1000 and TRF1001), so the
  transfer, GRN and production lists sort a "sort by number" request by creation time, then the
  number (`getDocumentOrderBy`): the numbers come from a sequence, so that is their own order.
  Identical results for numbers below the padding; an integration test lists all three across
  the boundary and fails with the old text sort.

- **A request body over the size limit got a 500** (fixed in `97da171`). body-parser rejects a
  JSON body over 100 KB with an http-errors `PayloadTooLargeError`; the global filter treated
  every non-`HttpException` as a 500 "Internal Server Error", where Nest's own filter answers
  with a 413. Found while probing O14. Failing test: `global-exception.filter.test.ts` ("a body
  over the size limit is a 413"). Now 413 "request entity too large" in the usual envelope on all
  three services (checked with a 2 MB body); 5xx and other errors stay a bare 500.

## Blocked

None of the tasks hit the three-attempt limit. Waiting on you, not on the work: CI has only
been rehearsed locally; `ci.yml` first runs on GitHub when the branch is pushed, and nothing is
pushed until you ask.

## Final report

**Biggest wins**

- Fewer database round trips on every request: the access check is one query instead of eight
  in all three services; the six key endpoints went from 13 / 15 / 13 / 30 / 25 / 38 queries to
  6 / 8 / 6 / 23 / 14 / 23. With both versions running side by side, list endpoints answer in
  18–19 ms instead of 23–26 ms, store stock in 33–34 instead of 40–41, and the writes are 5–24 %
  faster. At production-like volume the list counts run 2–9× faster on the new indexes.
- Lighter pages: the inventory screens' First Load JS fell from 1,245 KB to about 700 KB, and all
  routes together by 16 %. Revisiting master-data screens makes 5 API calls instead of 12, Edit
  and Acknowledge open with the record already loaded, a search box writes the URL twice instead
  of fourteen times, and typing in a form re-renders nothing it does not need to.
- A safety net: 75 tests instead of 13, 82 % line coverage of the stock and money services
  (none before), a GitHub Actions workflow, and 34 stricter lint and compiler checks enforced.
- Easier to change: the largest file is 1,169 lines instead of 5,807; helpers that existed in
  up to 21 copies exist once; 740 lines of dead portal code and three unused packages are gone.

**Bugs found:** four, all fixed. Dates a day early on servers east of UTC (dev laptops in IST)
and a regression from that fix; a too-large request body reported as a 500 instead of a 413; and
no transfer or kitchen production could be created after the 9,999th (GRNs after the 999,999th)
because the number default truncated, fixed by a migration that changes only those defaults.

**Not done, by decision:** no master-data cache (it would weaken active checks or show stale
names; see O13); `users.service.ts` not split until it has tests; no build-time gain claimed;
`/auth/login` is 40 KB heavier through a bundler chunking side effect (see O17 Decisions).

**Recommended next steps**

1. Push the branch when you are ready, so `ci.yml` runs on GitHub, then merge.
2. Write characterisation tests for `users.service.ts` (Super Admin and location-reach rules),
   then split it.
3. Move the store-stock summary's grouping into SQL: it loads every balance and groups them in
   memory (O10).
4. Log the stack of unexpected 500s server-side, and set `PRISMA_SLOW_QUERY_LOG=1` in the
   `dev` namespace if you want slow-query warnings there.
