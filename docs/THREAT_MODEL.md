# AAHAR Threat Model

Version: 1.0

## Scope

This threat model covers the Sprint 1 foundation: Admin Portal, Auth Service, User Service, Organization Service, PostgreSQL, Redis, and shared security controls.

## Assets

- User identity and role data
- JWT access and refresh secrets
- PostgreSQL data
- Redis session, OTP, and cache data
- Audit logs
- Service configuration and environment secrets

## Trust Boundaries

- Browser to API services
- API services to PostgreSQL
- API services to Redis
- Developer workstation to Docker Compose services
- Future production ingress to internal services

## Threats And Mitigations

| Threat | Risk | Mitigation |
| --- | --- | --- |
| Unauthorized API access | Protected data exposure | Global JWT guard and RBAC guard |
| Token replay or theft | Account misuse | Short access-token TTL and refresh-token separation |
| Cross-origin abuse | Browser-based API misuse | Allowlist-based CORS through `CORS_ORIGINS` |
| Brute force and abuse | Service degradation or OTP abuse | NestJS throttler rate limiting |
| Missing traceability | Incident investigation gaps | Correlation ID middleware and structured request logs |
| Unhandled errors leaking internals | Sensitive implementation details exposed | Global exception filter with standard error response |
| Missing audit trail | Weak accountability | Audit logger foundation for security and mutation events |
| Service dependency outage | Hidden platform instability | Health checks for database, Redis, and uptime |
| Weak HTTP defaults | Clickjacking or header downgrade risk | Helmet security headers |

## Residual Risks

- Audit persistence is foundation-only until business actions call the audit logger.
- JWT issuance and OTP workflows still require full implementation and tests.
- Production secret rotation and centralized monitoring must be added before go-live.

## Review Cadence

Update this threat model whenever a new service, authentication flow, externally reachable API, or sensitive data store is introduced.

