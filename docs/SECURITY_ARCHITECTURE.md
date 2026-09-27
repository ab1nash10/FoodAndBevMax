# AAHAR Security Architecture

Version: 1.0

## Scope

This document describes the Sprint 1 security baseline for the AAHAR Admin Portal and foundational NestJS services.

## Controls

- JWT bearer authentication is enforced through a global authentication guard.
- RBAC decorators and guards are available for service routes.
- Roles and permissions are resolved from the database on every authenticated request rather than
  read from the access token's claims. A permission change, role change, account disable, or
  account deletion therefore takes effect on the next request instead of surviving until the
  access token expires.
- Only a Super Admin may change Super Admin access, and the last active Super Admin cannot be
  demoted, disabled, or deleted.
- Helmet applies HTTP security headers.
- CORS is allowlist-based through `CORS_ORIGINS`.
- NestJS throttler applies API rate limiting through `THROTTLE_TTL` and `THROTTLE_LIMIT`.
- Global validation pipes enforce DTO whitelisting and reject unknown fields.
- Global exception filtering returns a standard error shape.
- Correlation IDs are generated or propagated through `X-Request-Id`.
- Request logging emits structured request logs with duration, status, and request ID.
- Audit logger foundation emits structured audit events for future create, update, delete, permission, and security actions.

## API Security Baseline

All business APIs are served under:

```text
/api/v1
```

Swagger remains outside the versioned API path:

```text
/api/docs
```

## CORS

Browser origins must be listed in:

```text
CORS_ORIGINS=http://localhost:3000,http://localhost:4001,http://localhost:4002,http://localhost:4003
```

Requests without an `Origin` header are allowed for server-to-server calls, health checks, and local command-line checks.

## Rate Limiting

Rate limiting is configured from environment:

```text
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
```

## Observability

Every HTTP request receives or reuses an `X-Request-Id`. Logs include this value so failures can be traced across services.

## Health Checks

Service health endpoints report:

- Service name
- Overall status
- PostgreSQL connectivity
- Redis connectivity
- Process uptime
