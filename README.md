# AAHAR

AAHAR is a full-stack food, cafeteria, kitchen, and inventory management platform. It provides an administrative web application, three domain-focused backend services, role-based access control, OTP authentication, stock workflows, and a shared PostgreSQL data model.

This repository is a pnpm/Turborepo monorepo designed so a developer can run the complete platform locally, understand the major domains, and add new features without first reverse-engineering the project layout.

## What is included

- OTP-based login, JWT access/refresh tokens, logout, session revocation, and audit logging
- Users, roles, permissions, and role-based access control (RBAC)
- Hospitals, locations, stores, kitchens, restaurants, counters, and employees
- Item categories, items, prices, time slots, and location-specific item mappings
- POS devices and payment-machine mappings
- Goods receipt notes (GRNs), batches, stock balances, and stock ledgers
- Kitchen production and kitchen stock
- Store-to-restaurant and kitchen-to-restaurant transfer workflows
- Restaurant menus and restaurant stock
- Responsive Next.js administration portal with light/dark theme support
- OpenAPI/Swagger documentation for every backend service

## Technology stack

| Area                   | Technology                                                     |
| ---------------------- | -------------------------------------------------------------- |
| Web application        | Next.js 15, React 19, TypeScript, Tailwind CSS, TanStack Query |
| Backend services       | NestJS 11, TypeScript, Passport, JWT, Swagger                  |
| Database               | PostgreSQL 16, Prisma ORM                                      |
| Cache and sessions     | Redis 7                                                        |
| Monorepo tooling       | pnpm workspaces, Turborepo                                     |
| Local infrastructure   | Docker and Docker Compose                                      |
| Validation and quality | Zod, class-validator, ESLint, Prettier, Husky                  |

## Architecture

```text
Browser
  |
  +-- Admin Portal (Next.js) ------------------------- :3000
        |
        +-- Auth Service ----------------------------- :4001
        |     OTP, JWT, refresh tokens, logout
        |
        +-- User Service ----------------------------- :4002
        |     users, roles, permissions
        |
        +-- Organization Service --------------------- :4003
              hospitals, locations, masters, inventory,
              kitchen, transfers, stock, and POS

Backend services
  +-- PostgreSQL ------------------------------------- :5432
  +-- Redis ------------------------------------------ :6379
```

All APIs use the `/api/v1` prefix. The services share the canonical Prisma schema in `prisma/schema.prisma` and common authentication/security utilities from `backend/packages/auth`.

## Repository layout

The workspaces are grouped into `frontend/` and `backend/` sections. This is a folder grouping
only — the repository stays a single pnpm workspace with one lockfile and one Turbo task graph.

```text
frontend/
  apps/
    admin-portal/          Next.js administration frontend
  packages/
    api-client/            Shared API client utilities
    types/                 Shared TypeScript types
    ui/                    Shared UI components
backend/
  services/
    auth-service/          OTP and token lifecycle APIs
    user-service/          User, role, and permission APIs
    organization-service/  Organization, master-data, and inventory APIs
  packages/
    auth/                  JWT guards, RBAC, middleware, and service bootstrap
    config/                Environment validation and loading
prisma/
  schema.prisma            Canonical database schema
  migrations/              Versioned database migrations
  seed.ts                  Development seed data
infra/docker/              Dockerfiles and Compose configuration
docs/                      Product, architecture, API, security, and UX documents
```

## Prerequisites

Install the following tools before starting:

- Node.js 24 LTS (the images run it; 22.12 is the minimum)
- pnpm 10 or newer
- Docker Desktop, or Docker Engine with Docker Compose
- Git

Check the installed versions:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

If pnpm is unavailable, enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
```

## Quick start: local development

This is the recommended workflow. PostgreSQL and Redis run in Docker while the frontend and backend services run locally with hot reload.

### 1. Clone and install

```bash
git clone https://github.com/knowsudhansh/aahar.git
cd aahar
pnpm install
```

### 2. Create the environment file

macOS or Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The defaults in `.env.example` are suitable for local development. Before any shared or production deployment, replace both JWT secrets with strong, unique values of at least 32 characters.

### 3. Start PostgreSQL and Redis

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

Confirm that both containers are healthy:

```bash
docker compose -f infra/docker/docker-compose.yml ps
```

### 4. Prepare the database

```bash
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

`db:generate` creates the Prisma client, `db:deploy` applies all committed migrations, and `db:seed` creates the development roles, permissions, organization data, and administrator account.

### 5. Start the applications

```bash
pnpm dev
```

Turborepo starts the frontend, all three services, and the shared-package TypeScript watchers in the same terminal. Keep this terminal open while developing.

### 6. Open the platform

- Admin portal: http://localhost:3000
- Auth health: http://localhost:4001/api/v1/health
- User health: http://localhost:4002/api/v1/health
- Organization health: http://localhost:4003/api/v1/health

## Development login and OTP

The seed creates this active super administrator:

```text
Email:    aahar@admin.local
Mobile:   9999999999
Password: set from ADMIN_PASSWORD (the Jenkins credential aahar-admin), email sign-in only
```

The password is never stored in the repository. The seed applies `ADMIN_PASSWORD` only while
the account has none, so a password changed later survives every deploy; locally, put
`ADMIN_PASSWORD=...` in `.env` before `pnpm db:seed`, or run `pnpm admin:password` at any time.

Request an OTP from the login page. In development, the Auth Service prints the generated OTP to the terminal running `pnpm dev`:

```json
{
  "channel": "email",
  "event": "auth_otp_generated",
  "otp": "482913",
  "target": "aahar@admin.local"
}
```

Enter the value from the `otp` field. The fixed development OTP `000000` is also accepted when `NODE_ENV=development`.

To request an OTP without the browser, run this in a second terminal.

macOS or Linux:

```bash
curl -X POST http://localhost:4001/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"aahar@admin.local"}'
```

Windows PowerShell:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4001/api/v1/auth/send-otp" `
  -ContentType "application/json" `
  -Body '{"email":"aahar@admin.local"}'
```

Never enable terminal OTP logging or the fixed OTP in production.

## Service URLs

| Service              | Base URL                       | Health           | Swagger                          |
| -------------------- | ------------------------------ | ---------------- | -------------------------------- |
| Admin Portal         | `http://localhost:3000`        | —                | —                                |
| Auth Service         | `http://localhost:4001/api/v1` | `/api/v1/health` | `http://localhost:4001/api/docs` |
| User Service         | `http://localhost:4002/api/v1` | `/api/v1/health` | `http://localhost:4002/api/docs` |
| Organization Service | `http://localhost:4003/api/v1` | `/api/v1/health` | `http://localhost:4003/api/docs` |

Swagger is served at `/api/docs`, while business APIs are served beneath `/api/v1`.

## Running one workspace

Use filters when working on a single application:

```bash
pnpm --filter @aahar/admin-portal dev
pnpm --filter @aahar/auth-service dev
pnpm --filter @aahar/user-service dev
pnpm --filter @aahar/organization-service dev
```

PostgreSQL and Redis must still be running, and backend services must be able to read the root `.env` file.

## Database commands

```bash
# Regenerate Prisma Client after schema changes
pnpm db:generate

# Create a migration while developing a schema change
pnpm db:migrate --name describe_your_change

# Apply committed migrations without creating a new one
pnpm db:deploy

# Re-run the idempotent development seed
pnpm db:seed

# Open Prisma Studio
pnpm db:studio
```

The source of truth is `prisma/schema.prisma`. Do not create service-specific Prisma schemas. The Prisma CLI
reads the database URL (from `.env` locally) and the migrations path from `prisma.config.mjs`.

## Running the complete stack with Docker

Create `.env`, start the database, and prepare it before launching all application containers:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm db:generate
pnpm db:deploy
pnpm db:seed
docker compose -f infra/docker/docker-compose.yml up --build -d
```

View logs:

```bash
docker compose -f infra/docker/docker-compose.yml logs -f
```

Stop the stack while preserving database data:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Remove the containers and local database/Redis volumes:

```bash
docker compose -f infra/docker/docker-compose.yml down -v
```

The `-v` command permanently deletes the local Docker database and Redis data.

## Quality checks

Run these before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Tests currently use workspace-level placeholders in areas where automated suites have not yet been added. Type checking, linting, formatting, and production builds remain required quality gates.

## Adding a feature

1. Update your local base branch and create a focused branch:

   ```bash
   git switch main
   git pull --ff-only
   git switch -c feature/short-feature-name
   ```

2. Read the relevant product and technical documentation in `docs/`.
3. Place frontend routes in `frontend/apps/admin-portal/app` and reusable frontend components in `frontend/apps/admin-portal/components` or `frontend/packages/ui`.
4. Put domain logic in the owning NestJS service; avoid importing private source files across services.
5. Update `prisma/schema.prisma` and create a migration when persistent data changes.
6. Protect new endpoints with the existing JWT/RBAC utilities and add appropriate permissions to the seed.
7. Update API documentation, shared types, and this README when behavior or setup changes.
8. Run the quality checks and manually verify the affected workflow.

Commit messages follow Conventional Commits, for example:

```text
feat: add supplier master
fix: prevent duplicate transfer acknowledgement
docs: clarify local database setup
```

## UI

The admin portal follows the mockups in `design-reference/`. `design-reference/PROGRESS.md`
records what each screen does, the decisions behind it, and what still needs an API.

- **Colours are tokens.** Use the `ds-*` Tailwind colours (`bg-ds-surface`, `text-ds-muted`,
  `bg-ds-status-pending-bg`, `bg-ds-tile-kitchens-bg`, `bg-ds-overlay`, …). They are RGB
  variables in `app/globals.css` with dark values under `.dark`, so a page needs no `dark:`
  classes and no raw hex or palette colours (`slate-500`, `red-50`). Add a token to both
  blocks and `tailwind.config.ts` when a new colour is needed.
- **Statuses come from `lib/status.ts`.** `<StatusChip status={…} />` renders any transfer,
  GRN, production, acknowledgement or stock status with its label and tone.
  `pnpm exec tsx lib/status.check.ts` fails if a Prisma status enum value has no chip.
- **Shared pieces.** `components/design-system.tsx` has StatusChip, TypeTag, Stepper,
  Timeline, KeyboardHint, SummaryCard, DetailSection and EmptyState.
  `components/ui-controls.tsx` has SegmentedControl, SavedViewTabs, FilterBar / FilterSearch /
  FilterSelect, BulkActionBar, DetailPanel, QuantityStepper, Toggle and Modal. Reuse them
  before writing new controls.
- **List + docked panel.** Transfers, GRNs, items and kitchen production open a record with
  `?id=<uuid>` on the list route, so links from the dashboard and the command palette land
  on it. Pages that read `useSearchParams` are wrapped in `<Suspense>` in their `page.tsx`.
- **Keyboard.** Ctrl/Cmd+K opens the command palette. N then T / G / P creates a transfer,
  GRN or production; G then D / T / I / P goes to the dashboard, transfers, items or
  production. These are ignored while typing in a field. New transfer also takes Ctrl+S (save
  draft) and Ctrl+Enter (submit). Every focusable element shows a focus ring, and the shell
  starts with a "Skip to content" link.
- **Permissions decide what renders.** Gate buttons and sections on the same codes the
  backend's `@Permissions` checks (`hasPermission('GRN_POST')`), so a role never sees an action
  that would return 403.
- **Check both themes and four widths.** 1440, 1100, 768 and 390 px, in light and dark, with
  no sideways page scroll (wide tables scroll inside their card).

## Key documentation

- `docs/AAHAR_BOOK.md` — consolidated project knowledge base
- `docs/PRD.md` and `docs/BRD.md` — product and business requirements
- `docs/TRD.md` and `docs/DEPLOYMENT_ARCHITECTURE.md` — technical architecture
- `docs/API_SPEC.md` — API conventions and contracts
- `docs/ERD.md` — data model overview
- `docs/SECURITY_ARCHITECTURE.md` and `docs/THREAT_MODEL.md` — security controls and risks
- `docs/UI_UX_GUIDELINES.md` — interface and interaction standards
- `docs/REGRESSION_CHECKLIST.md` — manual verification checklist
- `docs/DEPLOYMENT_GUIDE.md` — deployment and operations guidance

## Troubleshooting

### Port 5432 is already in use

Choose another host port, for example `5433`, and update the local database URL:

```text
POSTGRES_PORT=5433
DATABASE_URL=postgresql://aahar:aahar_password@localhost:5433/aahar?schema=public
```

Restart the PostgreSQL container after changing the port.

### A backend service fails environment validation

Confirm that `.env` exists in the repository root and contains `DATABASE_URL`, `REDIS_URL`, both JWT secrets, and the service port variables. JWT secrets must contain at least 32 characters.

### OTP is not visible

OTP values are logged only when `NODE_ENV=development`. Make sure the Auth Service is running and watch the terminal after requesting an OTP. The development-only fallback is `000000`.

### Prisma cannot connect

Check container health and verify that `DATABASE_URL` uses the host port published by Docker:

```bash
docker compose -f infra/docker/docker-compose.yml ps
pnpm exec prisma migrate status --schema prisma/schema.prisma
```

### Frontend cannot call an API

Verify that all services are healthy and that the API URLs and `CORS_ORIGINS` in `.env` match the frontend origin. The default frontend origin is `http://localhost:3000`.

## Security notes

- Never commit `.env`, access tokens, database passwords, OTP values, or production secrets.
- Replace the example JWT secrets before deploying outside a local machine.
- OTPs must be delivered through an approved provider and must never be logged in production.
- Keep authorization in backend guards and policies; hiding a frontend control is not authorization.
- Review `docs/SECURITY_ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, and `docs/PRODUCTION_READINESS.md` before deployment.

## Current development status

AAHAR contains working foundations and implemented workflows across authentication, administration, master data, inventory, kitchen production, transfers, and stock visibility. Some production integrations and automated test coverage remain project work. Consult `docs/IMPLEMENTATION_PLAN.md`, `docs/SPRINT_PLAN.md`, and `docs/PRODUCTION_READINESS.md` before treating the platform as production-ready.
