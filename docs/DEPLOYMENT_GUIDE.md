# AAHAR - Deployment Guide

Version: 1.0
Product Name: AAHAR
Document Type: Deployment Guide
Status: Mandatory before Sandbox, UAT, and Production deployment

---

# 1. Purpose

This document defines how AAHAR should be deployed across different environments.

AAHAR deployment must support:

- Local Development
- Sandbox / Integration
- UAT
- Production

AAHAR includes:

- Admin Portal
- Auth Service
- User Service
- Organization Service
- Future Inventory Service
- Future Kitchen Service
- Future POS / Order Service
- Future Payment Service
- Future ERP Service
- PostgreSQL
- Redis

---

# 2. Current Local Development Setup

Current local services:

| Component            | URL                            |
| -------------------- | ------------------------------ |
| Admin Portal         | http://localhost:3000          |
| Auth Service         | http://localhost:4001          |
| User Service         | http://localhost:4002          |
| Organization Service | http://localhost:4003          |
| Auth Swagger         | http://localhost:4001/api/docs |
| User Swagger         | http://localhost:4002/api/docs |
| Organization Swagger | http://localhost:4003/api/docs |

Local database:

```text
PostgreSQL via Docker
Redis via Docker
```

---

# 3. Environment Strategy

AAHAR must use separate environments.

```text
Local Development
↓
Sandbox
↓
UAT
↓
Production
```

Each environment must have separate:

- Database
- Redis
- Secrets
- URLs
- Payment keys
- ERP/SUN endpoints
- CORS configuration
- Logging configuration

---

# 4. Environment Purpose

## 4.1 Local Development

Used for:

- Coding
- Codex development
- Debugging
- Local testing

Uses:

```text
localhost
local Docker PostgreSQL
local Docker Redis
development OTP
development secrets
```

---

## 4.2 Sandbox

Used for:

- Internal testing
- Demo
- Integration testing
- Early manager review
- API validation

Uses:

```text
sandbox database
sandbox Redis
payment sandbox keys
SUN ERP UAT or mock endpoint
```

---

## 4.3 UAT

Used for:

- Business user testing
- Hospital team testing
- Store/Kitchen/Restaurant team testing
- Finance validation
- UAT sign-off

Uses:

```text
UAT database
UAT Redis
UAT payment credentials
SUN UAT endpoint
realistic sample data
```

---

## 4.4 Production

Used for:

- Real hospital operations

Uses:

```text
production database
production Redis
production payment credentials
production SUN ERP
production monitoring
production backup
production security
```

---

# 5. Local Development Startup

## 5.1 Start Docker Desktop

Docker Desktop must be running.

Check:

```powershell
docker ps
```

Expected containers:

```text
postgres
redis
```

If not running:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

---

## 5.2 Start AAHAR

From project root:

```powershell
cd C:\Users\SudhanshuV_Ext\Desktop\aahar
pnpm dev
```

This starts:

```text
Admin Portal
Auth Service
User Service
Organization Service
```

---

## 5.3 Verify Local Health

Open:

```text
http://localhost:3000
http://localhost:4001/api/v1/health
http://localhost:4002/api/v1/health
http://localhost:4003/api/v1/health
```

Expected:

```text
Admin Portal opens
Auth Service OK
User Service OK
Organization Service OK
Database OK
Redis OK
```

---

# 6. Local Development Environment Variables

Root `.env` example:

```env
NODE_ENV=development

POSTGRES_USER=aahar
POSTGRES_PASSWORD=aahar_password
POSTGRES_DB=aahar
POSTGRES_PORT=5433

REDIS_PORT=6379
REDIS_URL=redis://localhost:6379

ADMIN_PORTAL_PORT=3000
AUTH_SERVICE_PORT=4001
USER_SERVICE_PORT=4002
ORGANIZATION_SERVICE_PORT=4003

DATABASE_URL="postgresql://aahar:aahar_password@localhost:5433/aahar?schema=public"
DOCKER_DATABASE_URL=postgresql://aahar:aahar_password@postgres:5432/aahar?schema=public

JWT_ACCESS_SECRET=replace-with-a-strong-access-secret-before-deploying
JWT_REFRESH_SECRET=replace-with-a-strong-refresh-secret-before-deploying
JWT_ACCESS_TOKEN_TTL=30m
JWT_REFRESH_TOKEN_TTL=7d

OTP_TTL_SECONDS=300
THROTTLE_TTL=60000
THROTTLE_LIMIT=100

CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Admin Portal local env:

```text
frontend/apps/admin-portal/.env.local
```

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001/api/v1
NEXT_PUBLIC_AUTH_API_URL=http://localhost:4001/api/v1
NEXT_PUBLIC_USER_API_URL=http://localhost:4002/api/v1
NEXT_PUBLIC_ORGANIZATION_API_URL=http://localhost:4003/api/v1
```

---

# 7. Local Network Demo

If another user on the same network needs to access AAHAR:

Example laptop IP:

```text
172.25.208.1
```

Admin Portal URL:

```text
http://172.25.208.1:3000
```

Backend APIs must also be reachable:

```text
http://172.25.208.1:4001/api/docs
http://172.25.208.1:4002/api/docs
http://172.25.208.1:4003/api/docs
```

Update `frontend/apps/admin-portal/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://172.25.208.1:4001/api/v1
NEXT_PUBLIC_AUTH_API_URL=http://172.25.208.1:4001/api/v1
NEXT_PUBLIC_USER_API_URL=http://172.25.208.1:4002/api/v1
NEXT_PUBLIC_ORGANIZATION_API_URL=http://172.25.208.1:4003/api/v1
```

Update root `.env`:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://172.25.208.1:3000
```

Restart:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

Important:

Office firewall, VPN, or Wi-Fi isolation may block this. For reliable team testing, use Sandbox environment.

---

# 8. Common Local Issues

## 8.1 Prisma EPERM on Windows

Error:

```text
EPERM: operation not permitted, rename query_engine-windows.dll.node
```

Cause:

```text
Node/Nest service is locking Prisma engine.
```

Fix:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm db:generate
```

---

## 8.2 Next.js Turbopack Runtime Error

Error:

```text
Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
```

Fix:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force frontend/apps/admin-portal/.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
pnpm dev
```

If repeated, disable Turbopack in Admin Portal dev script.

---

## 8.3 OTP Failed / Failed to Fetch

Check:

```text
http://localhost:4001/api/v1/health
```

If Auth Service is OK, check:

```text
frontend/apps/admin-portal/.env.local
```

For local use, URLs should point to:

```text
localhost
```

For network demo, URLs should point to laptop IP.

---

# 9. Build Commands

Install dependencies:

```powershell
pnpm install
```

Generate Prisma:

```powershell
pnpm db:generate
```

Run migration in development:

```powershell
pnpm db:migrate
```

Run seed:

```powershell
pnpm db:seed
```

Lint:

```powershell
pnpm lint
```

Build:

```powershell
pnpm build
```

Start development:

```powershell
pnpm dev
```

---

# 10. Database Migration Rules

## Development

Use:

```powershell
pnpm db:migrate
```

or:

```powershell
pnpm db:migrate --name migration_name
```

## Sandbox / UAT / Production

Use:

```powershell
pnpm db:deploy
```

Production must not use:

```powershell
prisma migrate dev
```

Production uses:

```powershell
prisma migrate deploy
```

---

# 11. Seed Rules

Seed is used for:

- Super Admin
- Roles
- Permissions
- Default Hospital data if required
- Default Time Slots
- Development test data

Run:

```powershell
pnpm db:seed
```

Production seed must be controlled.

Do not seed fake demo data into production unless approved.

---

# 12. Docker Compose Local Services

Start PostgreSQL and Redis:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

Stop services:

```powershell
docker compose -f infra/docker/docker-compose.yml down
```

Reset database volume:

```powershell
docker compose -f infra/docker/docker-compose.yml down -v
```

Warning:

```text
down -v deletes local database data.
```

---

# 13. Sandbox Deployment

Sandbox should be deployed after core modules are stable enough for internal testing.

Recommended after:

```text
Hospital Foundation
Master Data
GRN
Store Stock
Kitchen Production
Transfers
Restaurant Stock
```

Sandbox URL example:

```text
https://sandbox-aahar.company.com
```

Sandbox must use:

```text
Sandbox PostgreSQL
Sandbox Redis
Sandbox secrets
Sandbox CORS
Sandbox payment keys
SUN UAT / mock endpoint
```

---

# 14. UAT Deployment

UAT should be deployed before production.

UAT URL example:

```text
https://uat-aahar.company.com
```

UAT must include:

- UAT database
- UAT Redis
- UAT roles
- UAT users
- UAT hospital setup
- Realistic master data
- UAT payment gateway
- SUN UAT integration
- Test reports

UAT must pass:

```text
docs/REGRESSION_CHECKLIST.md
```

---

# 15. Production Deployment

Production URL example:

```text
https://aahar.company.com
```

Production must use:

- HTTPS
- WAF
- Load Balancer
- Private PostgreSQL
- Private Redis
- Key Vault
- Monitoring
- Backups
- Alerting
- Audit logs
- Strict CORS
- Real payment gateways
- Real ERP/SUN integration

---

# 16. Recommended Azure Architecture

```text
Azure Front Door / Application Gateway
        ↓
WAF
        ↓
Admin Portal / Apps
        ↓
Backend Services
        ↓
Azure Database for PostgreSQL
Azure Cache for Redis
        ↓
Workers / Queues
        ↓
SUN ERP / Payment Gateways
```

Recommended Azure services:

```text
Azure App Service
or
Azure Container Apps
or
AKS

Azure Database for PostgreSQL
Azure Cache for Redis
Azure Key Vault
Azure Blob Storage
Azure Monitor
Application Insights
```

---

# 17. Production Environment Variables

Production must define:

```env
NODE_ENV=production

DATABASE_URL=production_database_url
REDIS_URL=production_redis_url

JWT_ACCESS_SECRET=secure_value_from_key_vault
JWT_REFRESH_SECRET=secure_value_from_key_vault

JWT_ACCESS_TOKEN_TTL=30m
JWT_REFRESH_TOKEN_TTL=7d

OTP_TTL_SECONDS=300
THROTTLE_TTL=60000
THROTTLE_LIMIT=100

CORS_ORIGINS=https://aahar.company.com
```

Frontend production env:

```env
NEXT_PUBLIC_AUTH_API_URL=https://api.aahar.company.com/auth/api/v1
NEXT_PUBLIC_USER_API_URL=https://api.aahar.company.com/user/api/v1
NEXT_PUBLIC_ORGANIZATION_API_URL=https://api.aahar.company.com/organization/api/v1
```

Final API routing depends on gateway/API design.

---

# 18. Secrets Management

Production secrets must be stored in:

```text
Azure Key Vault
```

Never store production secrets in:

```text
.env
GitHub
plain text
frontend code
logs
```

Secrets include:

- JWT secrets
- DB password
- Redis password
- Payment gateway keys
- Pine Labs credentials
- PayU keys
- Razorpay keys
- ERP/SUN credentials
- SMS provider credentials

---

# 19. CORS Deployment Rules

Development:

```text
localhost allowed
```

Sandbox:

```text
sandbox domain only
```

UAT:

```text
uat domain only
```

Production:

```text
production domain only
```

Never use:

```text
CORS_ORIGINS=*
```

in production.

---

# 20. Swagger Deployment Rules

Development:

```text
Swagger enabled
```

Sandbox:

```text
Swagger enabled but protected if possible
```

UAT:

```text
Swagger protected
```

Production:

Recommended:

```text
Swagger disabled
```

or:

```text
Swagger restricted by admin auth/IP allowlist
```

Swagger must never expose secrets.

---

# 21. CI/CD Pipeline

Recommended pipeline steps:

```text
Checkout code
Install pnpm
Install dependencies
Run lint
Run type check
Run build
Run tests
Validate migrations
Build Docker images
Run security scan
Deploy to target environment
Run smoke tests
```

Production deployment should require manual approval.

---

# 22. Git Branch Strategy

Current branches:

```text
main
feature/phase-2-master-data
```

Recommended strategy:

```text
main = stable
develop = integration
feature/* = feature branches
release/* = UAT release
hotfix/* = production fix
```

Example:

```powershell
git checkout -b feature/phase-5-restaurant-operations
```

Commit example:

```powershell
git add .
git commit -m "feat: phase 5 restaurant operations"
git push origin feature/phase-5-restaurant-operations
```

---

# 23. Deployment Checklist

Before deployment:

```text
[ ] Code committed
[ ] Code pushed
[ ] Pull request reviewed
[ ] Lint passed
[ ] Build passed
[ ] Migrations reviewed
[ ] Seed reviewed
[ ] Environment variables configured
[ ] Secrets configured
[ ] Database backup taken
[ ] Deployment approved
```

---

# 24. Smoke Test After Deployment

After deployment, verify:

```text
Frontend opens
Auth health OK
User service health OK
Organization service health OK
Database OK
Redis OK
Login works
Dashboard opens
Swagger/protected APIs work where allowed
```

Minimum smoke URLs:

```text
/admin
/api/auth/health
/api/user/health
/api/organization/health
```

Actual production route may vary based on gateway setup.

---

# 25. Post-Deployment Regression

After deployment, run:

```text
docs/REGRESSION_CHECKLIST.md
```

At minimum verify:

- Login
- Hospital
- Item Category
- Item Master
- GRN
- Store Stock
- Transfer
- Restaurant Stock
- Kitchen Production
- Kitchen Stock

As more modules are added, include:

- POS
- Payments
- Closing
- ERP

---

# 26. Rollback Strategy

Every deployment must have rollback plan.

Rollback options:

```text
Code rollback
Previous Docker image
Database restore
Feature flag disable
Manual hotfix
```

Before production migration:

```text
Take database backup
Confirm restore process
```

Critical:

```text
Payment and ERP duplicate prevention must be considered during rollback.
```

---

# 27. Backup Strategy

Production backup requirements:

```text
Daily full backup
Point-in-time recovery
30-day retention minimum
Backup restore tested
```

Backup must include:

- PostgreSQL
- Uploaded files
- ERP export files
- Important configuration

---

# 28. Monitoring Strategy

Monitor:

- API uptime
- API latency
- Error rate
- Database health
- Redis health
- CPU
- Memory
- Disk
- Payment failures
- ERP failures
- Login failures
- Stock mismatch alerts

Recommended:

```text
Azure Monitor
Application Insights
Grafana
Sentry
```

---

# 29. Logging Strategy

Logs must include:

```text
request_id
service_name
method
path
status_code
duration_ms
user_id
hospital_id
error_name
error_message
```

Never log:

```text
JWT
refresh token
OTP in production
database password
payment credentials
ERP secrets
```

---

# 30. File Storage Deployment

Use Azure Blob Storage for:

- Proof uploads
- Closing proof
- Wastage proof
- ERP export files
- Reports
- Item images

Do not store production files inside app container filesystem.

---

# 31. Payment Deployment

Before enabling production payments:

- Use sandbox keys first.
- Test success.
- Test failure.
- Test timeout.
- Test duplicate callback.
- Test refund.
- Test reconciliation.
- Store secrets in Key Vault.
- Confirm callback URL is HTTPS.
- Confirm idempotency works.

Payment providers:

```text
Pine Labs
PayU
Razorpay
UPI
Cash
Card
```

---

# 32. ERP/SUN Deployment

Before enabling production ERP:

- Get final SUN payload format.
- Test UAT posting.
- Test failed posting.
- Test retry.
- Test duplicate prevention.
- Confirm business date mapping.
- Confirm payment mode mapping.
- Confirm discount and GST mapping.

Only final approved transactions should be posted.

---

# 33. Domain and SSL

Production must have:

```text
valid domain
valid SSL certificate
HTTPS enforced
HTTP redirected to HTTPS
```

Example:

```text
https://aahar.company.com
```

---

# 34. Firewall and IP Rules

Production database:

```text
not public
```

Redis:

```text
not public
```

ERP/SUN:

```text
IP allowlist if possible
```

Payment callbacks:

```text
allow only trusted providers where possible
```

---

# 35. Production User Setup

Before go-live:

- Super Admin created
- Hospital Admin created
- Store Manager created
- Chef created
- Kitchen Operator created
- Restaurant User created
- POS Operator created
- Supervisor created
- Finance User created

Roles and permissions must be verified.

---

# 36. Data Setup Before Go-Live

Required master data:

- Hospital
- Stores
- Kitchens
- Restaurants
- Counters
- Item Categories
- Items
- Employees
- Time Slots
- Store Item Mappings
- Kitchen Item Mappings
- Restaurant Menus
- Payment Gateways
- Discount Rules

---

# 37. Production Release Process

Recommended process:

```text
Freeze release branch
↓
Run lint/build/tests
↓
Deploy to UAT
↓
Run regression
↓
Get UAT sign-off
↓
Backup production
↓
Deploy production
↓
Run smoke test
↓
Monitor
↓
Hypercare
```

---

# 38. Hypercare

After go-live, monitor for:

- Login issues
- POS issues
- Payment issues
- Stock mismatch
- Closing mismatch
- ERP failures
- Slow pages
- User feedback

Recommended hypercare:

```text
1 to 4 weeks
```

---

# 39. Deployment Risks

Main risks:

- Database migration failure
- Incorrect environment variables
- Payment gateway callback failure
- ERP posting failure
- CORS misconfiguration
- Token/session issue
- Stock mismatch
- Redis unavailable
- Backup failure

Each risk must have mitigation plan.

---

# 40. Local Developer Daily Startup

Each day:

```powershell
cd C:\Users\SudhanshuV_Ext\Desktop\aahar
docker ps
pnpm dev
```

If Docker not running:

```powershell
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
pnpm dev
```

If stale Node issue:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
pnpm dev
```

If Next cache issue:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force frontend/apps/admin-portal/.next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .turbo -ErrorAction SilentlyContinue
pnpm dev
```

---

# 41. Deployment Definition of Done

Deployment is successful only when:

- App opens.
- Login works.
- Health checks pass.
- Database connected.
- Redis connected.
- Swagger/API smoke passes where enabled.
- Regression checklist passes.
- Monitoring shows healthy.
- No critical errors in logs.
- Business owner confirms access.

---

# 42. Final Rule

AAHAR must never be deployed to production without:

```text
Backup
Migration review
Secrets validation
Smoke testing
Regression testing
Monitoring
Rollback plan
```

Deployment must be controlled, auditable, and repeatable.
