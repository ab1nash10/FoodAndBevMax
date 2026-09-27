# AAHAR Deployment Architecture

Version: 1.0

## Sprint 1 Deployment Scope

Sprint 1 runs the Admin Portal and three foundational NestJS services:

- Auth Service
- User Service
- Organization Service

The development infrastructure includes PostgreSQL and Redis through Docker Compose.

## Local Development

Start infrastructure:

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

Start applications and services:

```bash
pnpm dev
```

## Runtime Ports

- Admin Portal: `3000`
- Auth Service: `4001`
- User Service: `4002`
- Organization Service: `4003`
- PostgreSQL: `5432`
- Redis: `6379`

## API Routes

Health checks:

```text
http://localhost:4001/api/v1/health
http://localhost:4002/api/v1/health
http://localhost:4003/api/v1/health
```

Swagger:

```text
http://localhost:4001/api/docs
http://localhost:4002/api/docs
http://localhost:4003/api/docs
```

## Configuration

Root `.env` is loaded by every service during `pnpm dev`. Docker Compose injects environment variables into containers.

Security-relevant variables:

```text
DATABASE_URL
REDIS_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
CORS_ORIGINS
THROTTLE_TTL
THROTTLE_LIMIT
```

## Production Direction

The TRD allows Kubernetes or Azure App Services for production deployment. Production must preserve the same security baseline:

- HTTPS termination
- Secret injection through managed secret storage
- Strict CORS origins
- Health checks for orchestration
- Centralized logs with request IDs
- PostgreSQL and Redis managed services or hardened equivalents

