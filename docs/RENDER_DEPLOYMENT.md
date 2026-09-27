# AAHAR - Render Deployment

Version: 1.0
Product Name: AAHAR
Document Type: Render Deployment Runbook

---

## Purpose

This guide prepares AAHAR for deployment from GitHub to Render using separate Render Web Services for the Admin Portal and each backend service.

Do not commit Render secrets to GitHub. Configure secrets only in the Render dashboard.

---

## Render Services

Create these Render services from the same GitHub repository:

| Render service name          | Type              | Workspace package             |
| ---------------------------- | ----------------- | ----------------------------- |
| `aahar-admin-portal`         | Web Service       | `@aahar/admin-portal`         |
| `aahar-auth-service`         | Web Service       | `@aahar/auth-service`         |
| `aahar-user-service`         | Web Service       | `@aahar/user-service`         |
| `aahar-organization-service` | Web Service       | `@aahar/organization-service` |
| `aahar-postgres`             | PostgreSQL        | Managed by Render             |
| `aahar-redis`                | Key Value / Redis | Managed by Render             |

Use Node.js 22 or newer and pnpm 10 or newer.

---

## Build And Start Commands

Use repository root as the Render root directory for each web service.

### Admin Portal

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter @aahar/admin-portal build
```

Start command:

```bash
pnpm --filter @aahar/admin-portal start
```

The Admin Portal start script uses `PORT` first, then `ADMIN_PORTAL_PORT`, then `3000`, and binds to `0.0.0.0`.

### Auth Service

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @aahar/auth-service build
```

Start command:

```bash
pnpm --filter @aahar/auth-service start:prod
```

### User Service

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @aahar/user-service build
```

Start command:

```bash
pnpm --filter @aahar/user-service start:prod
```

### Organization Service

Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @aahar/organization-service build
```

Start command:

```bash
pnpm --filter @aahar/organization-service start:prod
```

---

## Environment Variables

Render sets `PORT` automatically for every Web Service. Do not hardcode it.

### Backend Services

Set these on:

- `aahar-auth-service`
- `aahar-user-service`
- `aahar-organization-service`

```env
NODE_ENV=production
DATABASE_URL=<Render PostgreSQL external or internal connection URL>
REDIS_URL=<Render Redis / Key Value connection URL>
JWT_ACCESS_SECRET=<strong secret, at least 32 characters>
JWT_REFRESH_SECRET=<strong secret, at least 32 characters>
JWT_ACCESS_TOKEN_TTL=30m
JWT_REFRESH_TOKEN_TTL=7d
OTP_TTL_SECONDS=300
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
CORS_ORIGINS=https://<aahar-admin-portal>.onrender.com
```

Optional:

```env
HOST=0.0.0.0
```

The services already fall back locally to:

- Auth Service: `4001`
- User Service: `4002`
- Organization Service: `4003`

### Admin Portal

Set these on `aahar-admin-portal` before building:

```env
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://<aahar-auth-service>.onrender.com/api/v1
NEXT_PUBLIC_AUTH_API_URL=https://<aahar-auth-service>.onrender.com/api/v1
NEXT_PUBLIC_USER_API_URL=https://<aahar-user-service>.onrender.com/api/v1
NEXT_PUBLIC_ORGANIZATION_API_URL=https://<aahar-organization-service>.onrender.com/api/v1
```

Optional:

```env
ADMIN_PORTAL_PORT=3000
HOST=0.0.0.0
```

Use the real Render URLs after each service is created.

---

## Database Migration

Run migrations after PostgreSQL is attached and before smoke testing.

Recommended Render Shell command from any backend service:

```bash
pnpm db:deploy
```

Production and Render environments must use `db:deploy`, not `db:migrate`.

---

## Seed Command

Run seed only when the target environment should receive AAHAR roles, permissions, time slots, and the initial Super Admin user.

Render Shell command:

```bash
pnpm db:seed
```

Do not seed fake demo data into production unless approved.

---

## Demo Login Details

The seed script creates this user for initial access:

```text
Name: Super Admin
Mobile: 9999999999
Email: aahar@admin.local
Role: Super Admin
```

For local and approved development demos, OTP `000000` is supported only when `NODE_ENV=development`.

For Render production-like deployments with `NODE_ENV=production`, do not rely on development OTP. Configure the approved OTP delivery path and never log OTP values.

---

## Manual Deployment Steps

1. Push the current branch to GitHub.
2. Create `aahar-postgres` in Render.
3. Create `aahar-redis` in Render.
4. Create `aahar-auth-service` from the GitHub repo.
5. Add backend environment variables to Auth Service.
6. Deploy Auth Service.
7. Create `aahar-user-service` and `aahar-organization-service`.
8. Add the same backend environment variables to User and Organization services.
9. Deploy User and Organization services.
10. Run `pnpm db:deploy` from a backend Render Shell.
11. Run `pnpm db:seed` only for approved seed setup.
12. Create `aahar-admin-portal`.
13. Add Admin Portal environment variables with the deployed backend URLs.
14. Deploy Admin Portal.
15. Update backend `CORS_ORIGINS` with the final Admin Portal URL.
16. Redeploy backend services after CORS changes.
17. Smoke test the deployed URLs.

---

## Smoke Test URLs

Replace hostnames with the real Render service URLs.

```text
https://<aahar-admin-portal>.onrender.com
https://<aahar-auth-service>.onrender.com/api/v1/health
https://<aahar-user-service>.onrender.com/api/v1/health
https://<aahar-organization-service>.onrender.com/api/v1/health
```

Swagger path remains:

```text
https://<service>.onrender.com/api/docs
```

Protect or disable Swagger before production go-live according to `docs/PRODUCTION_READINESS.md`.

---

## render.yaml

No `render.yaml` is added yet.

Reason: AAHAR is currently a multi-service pnpm monorepo, and the final public Render URLs are needed before safely encoding CORS and frontend build-time URLs in a blueprint. Use the manual setup above for the first Render deployment.

---

## Security Notes

- Never commit `.env` files or production secrets.
- Use strong JWT secrets of at least 32 characters.
- Keep production CORS strict.
- Do not use `CORS_ORIGINS=*`.
- Do not log OTP values in production.
- Use Render managed PostgreSQL and Redis credentials through environment variables.
