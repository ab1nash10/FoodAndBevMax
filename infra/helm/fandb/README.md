# fandb Helm chart

Deploys the three AAHAR backend services and the admin portal.

## Why three backend deployments

The services are separate NestJS processes on separate ports, built from the same
Dockerfile with different `SERVICE` build args. A single "backend" deployment runs only the
service its image contains, so the other two APIs are simply absent - and `auth-service` is
what serves sign-in, so the portal cannot log anyone in without it.

| Deployment           | Service              | Port | Serves                                   |
| -------------------- | -------------------- | ---- | ---------------------------------------- |
| `fandb-auth`         | auth-service         | 4001 | OTP, password sign-in, tokens            |
| `fandb-user`         | user-service         | 4002 | users, roles, permissions, notifications |
| `fandb-organization` | organization-service | 4003 | hospitals, items, GRN, stock, transfers  |
| `fandb-portal`       | admin-portal         | 3000 | the Next.js UI                           |

## Images

All four images live in one ECR repository, `max-ai-repo`, distinguished by a tag prefix
rather than by a repository of their own:

| Deployment           | Image                                    |
| -------------------- | ---------------------------------------- |
| `fandb-auth`         | `max-ai-repo:auth-service-<tag>`         |
| `fandb-user`         | `max-ai-repo:user-service-<tag>`         |
| `fandb-organization` | `max-ai-repo:organization-service-<tag>` |
| `fandb-portal`       | `max-ai-repo:admin-portal-<tag>`         |

`image.repository` in `values.yaml` names the repository, each entry's `tagPrefix` names the
prefix, and `image.tag` is the part you override per deploy. Build them with
`scripts/docker-build.sh <target> <tag>`, which applies the same scheme.

## Configuration and secrets

The chart creates the ConfigMap and the Secret itself. A pod whose Secret is missing does
not fail visibly - it crash-loops with `Invalid service environment configuration` - so the
four values below are `required`: `helm upgrade` fails immediately and names what is
missing instead.

Keep them in a file that is not committed (`infra/helm/**/secrets*.yaml` is git-ignored):

```yaml
# infra/helm/fandb/secrets.yaml
config:
  env:
    corsOrigins: https://k8s-devexternal-e58b3c8396-903158879.ap-south-1.elb.amazonaws.com
  secrets:
    DATABASE_URL: postgresql://user:pass@host:5432/aahar?schema=public&connection_limit=10
    JWT_ACCESS_SECRET: <openssl rand -base64 48>
    JWT_REFRESH_SECRET: <a different openssl rand -base64 48>
```

Both JWT secrets must be at least 32 characters and different from each other.
`CORS_ORIGINS` must be the origin in the browser's address bar, or every sign-in fails CORS.

If you would rather manage those objects outside Helm, set `config.create=false`; Helm will
not adopt a ConfigMap or Secret it did not create.

## Redis

Optional, switched by `REDIS_URL`. With it, OTPs (and their cooldowns and attempt counts),
refresh tokens and the rate limits live in Redis: shared by every pod and kept across
deploys, so backends can run more than one replica and a deploy signs nobody out. Without
it each pod keeps them in memory - a deploy signs everyone out, and **every backend must
stay at one replica**, because a refresh or an OTP check that lands on another pod fails.

Three ways to run it:

- **ElastiCache (production).** Redis or Valkey, cluster mode disabled. Put the primary
  endpoint in `config.secrets.REDIS_URL` - `rediss://` when in-transit encryption is on, with
  the AUTH token (or an ACL user) in the URL: `rediss://default:<token>@<primary-endpoint>:6379`.
  The Jenkinsfile passes `REDIS_URL` from the job's environment when one is set. The cluster
  needs a route and a security-group rule to port 6379. `infra/aws/` has a CloudFormation
  template that creates all of it, and the step-by-step runbook.
- **In-cluster (dev).** `redis.enabled=true` deploys `redis:7-alpine` and points `REDIS_URL`
  at it. One replica, no persistence, no auth.
- **None.** Leave both unset; everything keeps working on one replica, as before.

A Redis outage does not take the API down: the health endpoint reports it but readiness
follows the database only, the rate limiter falls back to counting in each pod's memory,
and sign-in returns an error until Redis is back. Keys are prefixed `aahar:`, so one Redis
can be shared with other applications.

The single-image deployment (`SERVICE=all`) takes the same `REDIS_URL` environment variable.

## Routing

The chart creates two Ingress objects, `fandb-api` and `fandb-portal`, joined into one ALB
through `ingress.groupName`. Two rather than one because the ALB health-check path is set
per Ingress and the two halves do not agree on it: Nest mounts its controllers under
`<basePath>/api/v1`, so a service answers at `/fandb/api/v1/health`, while the portal's own
route handler is at `/fandb/api/health`.

Each service's `apiPaths` in `values.yaml` lists the prefixes it answers, relative to
`basePath`. They matter: the three services are separate processes, so a request for
`/api/v1/auth` that reaches anything but `fandb-auth` comes back 404. Everything not matched
by an API prefix goes to the portal.

Do not also apply `infra/k8s/40-ingress.yaml` - that is the raw-manifest path, and both would
join the same ALB group at the same order.

## Install

```bash
helm upgrade --install fandb infra/helm/fandb \
  --namespace dev --create-namespace \
  -f infra/helm/fandb/secrets.yaml \
  --set image.tag=$(git rev-parse --short=12 HEAD)
```

Use the commit SHA, not `latest`: a rollout cannot be rolled back against a moving tag.

The tag is only the suffix - the chart builds the full reference per workload, so one
`image.tag` covers all four images.

## The routing prefix

`basePath` (default `/fandb`) must agree in three places or routing breaks:

1. `BASE_PATH` in the ConfigMap - runtime, backend
2. `NEXT_PUBLIC_BASE_PATH` baked into the portal image - **build time**
3. the ingress path rules

An AWS ALB cannot strip a path prefix the way an NGINX ingress can, so the pods serve under
the prefix themselves. Changing it means rebuilding the portal image, not just editing
values.

## Migrations and seeding

Both run automatically, as Helm hooks, in this order on every install and upgrade:

```
aahar-config / aahar-secrets   weight -10
fandb-migrate                  weight   0    prisma migrate deploy
fandb-seed                     weight   1    roles, permissions, admin account
then the Deployments roll
```

There is nothing to apply by hand. The migration has to finish before any service starts -
all three share one Prisma schema - and without the seed there are no permissions, no roles
and no users, so nobody can sign in at all.

Re-running is safe: `prisma migrate deploy` applies only what is outstanding, and the seed
uses upserts, `skipDuplicates` on the join tables and an existence check before creating the
sample location. Verified against an empty database - a second pass left the counts
unchanged at 95 permissions, 6 roles, 211 role-permissions, 1 user.

The seed gives the Super Admin (`aahar@admin.local`) its first password from
`config.secrets.ADMIN_PASSWORD` (the Jenkins credential `aahar-admin`), only if the account has
no password yet, so one changed later survives upgrades. It is never stored in the repository.
`pnpm admin:password` resets it by hand.

`dbJobs.enabled=false` turns both off, for a database managed elsewhere.
