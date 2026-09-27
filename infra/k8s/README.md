# AAHAR deployment (EKS, ap-south-1)

> **These manifests are not the deployed path.** AAHAR is deployed by the Helm chart in
> `infra/helm/fandb`, as the release `fandb` in namespace `dev`. That is what the Jenkins
> pipeline runs and what the cluster runs. The files in this directory, plus
> `backend/deployment.yml` and `frontend/deployment.yml`, are the raw-manifest alternative,
> kept for reference.
>
> Never apply both. Each creates an ingress in the ALB group `dev-external`, and the
> controller rejects the conflict; they also target different namespaces (`aahar` here,
> `dev` for the chart), so applying these gives you a second, half-configured copy of
> everything. Symptoms of the mixed state: requests reaching the wrong service, or a
> 404 from an API path that a running pod clearly maps.

## Deploying (the actual path)

```bash
helm upgrade --install fandb infra/helm/fandb -n dev --create-namespace \
  --set-string image.tag=<commit-sha> \
  --set-string config.secrets.DATABASE_URL='postgresql://...?connection_limit=10' \
  --set-string config.secrets.JWT_ACCESS_SECRET='<32+ chars>' \
  --set-string config.secrets.JWT_REFRESH_SECRET='<32+ chars, different>' \
  --wait --timeout 10m
```

The chart brings up all three services and the portal, and runs the migration and the seed
as pre-upgrade hooks in that order. Each backend service is a separate process on its own
port, so all three must be deployed: `auth-service` is what serves sign-in, and without it
`POST /fandb/api/v1/auth/login-with-password` returns 404 while the other APIs work.

The seed creates the Super Admin `aahar@admin.local` (mobile `9999999999`) and, while it has
no password, gives it the default from `prisma/seed.ts`. Later deploys leave it alone, so
change it after the first sign-in; `pnpm admin:password` resets it by hand.

### Verify the deploy

```bash
scripts/smoke.sh https://k8s-devexternal-e58b3c8396-903158879.ap-south-1.elb.amazonaws.com
```

It checks that each path is answered by the component that serves it, and exits non-zero
otherwise. The failure worth knowing about: when the API ingress rules are missing, every
`/fandb/api/v1/*` request falls through to the portal's `/fandb` catch-all and **Next.js
answers with an HTML 404**. That looks exactly like "this route does not exist on the
service", so the instinct is to go hunting in NestJS - but no service was reached at all.
The services only ever return JSON, so an HTML body on an API path means the request never
got to one. Check the ingresses, not the code:

```bash
kubectl -n dev get ingress
kubectl get ingress -A -o wide | grep dev-external   # an older ingress competing for the group
```

These manifests are not a production sign-off either way. Read the open blockers at the
bottom before using any of this for something customer-facing.

## Layout (raw-manifest path)

Workloads live beside the code they deploy, so each pipeline owns its own files:

| Files                                                                      | Owner                            |
| -------------------------------------------------------------------------- | -------------------------------- |
| `frontend/Dockerfile`, `frontend/deployment.yml`, `frontend/buildspec.yml` | frontend pipeline                |
| `backend/Dockerfile`, `backend/deployment.yml`, `backend/buildspec.yml`    | backend pipeline                 |
| `infra/k8s/*`                                                              | shared, applied once per cluster |

Each Dockerfile uses `turbo prune` to build from only its own subtree, so a frontend commit
does not rebuild the services and vice versa. Both buildspecs run typecheck, lint and test
before the image is built, and tag images with the commit SHA rather than `latest`.

Shared resources in this directory: namespace, ConfigMap, Secret template, migration Job
and the ALB ingress.

## First bring-up

```bash
# 1. Namespace and configuration
kubectl apply -f infra/k8s/00-namespace.yaml
kubectl apply -f infra/k8s/10-configmap.yaml

# 2. Secrets - create imperatively or via External Secrets; never commit real values
kubectl -n aahar create secret generic aahar-secrets \
  --from-literal=DATABASE_URL='postgresql://...?connection_limit=10' \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 48)"

# 3. Migrate, and wait. All three services share one Prisma schema, so this must finish
#    before any of them start.
kubectl -n aahar delete job aahar-migrate --ignore-not-found
kubectl -n aahar apply -f infra/k8s/20-migrate-job.yaml
kubectl -n aahar wait --for=condition=complete job/aahar-migrate --timeout=300s

# 4. Seed, ONCE per environment. Migrations create the schema but no data: without this
#    there are no permissions, no roles and no users, so nobody can sign in at all.
#    If ADMIN_EMAIL and ADMIN_PASSWORD are in the Secret, this also gives the Super Admin
#    its password, and step 7 is then unnecessary.
kubectl -n aahar apply -f infra/k8s/21-seed-job.yaml
kubectl -n aahar wait --for=condition=complete job/aahar-seed --timeout=300s

# 5. Workloads - each pipeline applies only its own file
kubectl apply -f backend/deployment.yml
kubectl apply -f frontend/deployment.yml

# 6. Ingress
kubectl apply -f infra/k8s/40-ingress.yaml

# 7. Optional: replace the Super Admin's password (the seed gives it the default from
#    prisma/seed.ts on first run).
kubectl -n aahar run admin-password --rm -it --restart=Never \
  --image=013929206983.dkr.ecr.ap-south-1.amazonaws.com/max-ai-repo:migrate-<tag> \
  --env="DATABASE_URL=..." --env="ADMIN_EMAIL=aahar@admin.local" \
  --env="ADMIN_PASSWORD=..." -- pnpm admin:password
```

Verified against empty databases: after step 3 the schema exists with zero rows; step 4
creates 95 permissions, 6 roles and the `aahar@admin.local` Super Admin, which can sign in
immediately with the ADMIN_PASSWORD from the Secret.

The seeded administrator is `aahar@admin.local`, mobile `9999999999`.

## Images

Five images, all in the one `max-ai-repo` ECR repository and told apart by a tag prefix:
`auth-service-`, `user-service-`, `organization-service-`, `migrate-`, `admin-portal-`.

Build them with the helper, which resolves the repository root itself so the build context
is right whichever directory the CI stage runs in:

```bash
export REGISTRY=013929206983.dkr.ecr.ap-south-1.amazonaws.com
scripts/docker-build.sh auth-service "$(git rev-parse --short=12 HEAD)"
# -> 013929206983.dkr.ecr.ap-south-1.amazonaws.com/max-ai-repo:auth-service-<sha>
```

Targets: `frontend`, `auth-service`, `user-service`, `organization-service`, `migrate`.
Set `ECR_REPOSITORY` to build into a repository other than `max-ai-repo`.

All five must be built from the repository root: they use `turbo prune`, which needs the
whole workspace to work out what an app depends on. The portal image is additionally
environment-specific, because `NEXT_PUBLIC_*` is inlined by Next at build time.

Use immutable tags (the commit SHA), not `latest`. The manifests here ship with `latest`
only so they are readable; the buildspecs override it via `kubectl set image`.

## Required environment

Each service validates its environment at startup and refuses to boot if anything is
missing, with a message naming the variables. Five values have no default:

Redis is commented out for now, so `REDIS_URL` is not among them - OTPs and the
refresh-token denylist are held in process instead. See the note under "Known blockers".

| Variable             | Source     | Notes                                                         |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `DATABASE_URL`       | Secret     | add `?connection_limit=10`; three services share one database |
| `JWT_ACCESS_SECRET`  | Secret     | **minimum 32 characters**, else startup fails                 |
| `JWT_REFRESH_SECRET` | Secret     | minimum 32 characters, and different from the access secret   |
| `CORS_ORIGINS`       | ConfigMap  | the browser origin, e.g. the load balancer hostname           |
| `PORT`               | Deployment | 4001 auth, 4002 user, 4003 organization                       |

Everything else has a default: `BASE_PATH`, `NODE_ENV`, `LOG_LEVEL`, the JWT TTLs,
`OTP_TTL_SECONDS` and the throttle settings.

A pod that exits with `Invalid service environment configuration` is missing one of these.
The manifests here wire them with `envFrom` against `aahar-config` and `aahar-secrets`, so
both objects must exist **in the same namespace as the pod** - a Secret cannot be read
across namespaces.

## One deployment per service

`backend/deployment.yml` creates three Deployments, because the three services are separate
processes on separate ports. A single "backend" Deployment runs only whichever service its
image was built for: the other two APIs are then simply absent, and the portal's calls to
them fail. `auth-service` in particular is what serves sign-in.

## Probe design

Liveness is a TCP check and readiness is the HTTP health endpoint, on purpose. The service
health endpoint also probes Postgres and Redis, so using it for liveness would restart every
pod during a brief database blip instead of just pulling them from the load balancer.

## Known blockers before production traffic

These are **not** solved by these files:

1. **OTP is never delivered.** No SMS or email provider is wired, so mobile sign-in cannot
   work. Email plus password is the only usable path today.
2. **Redis is commented out.** OTPs and the refresh-token denylist live in each pod's
   memory, so they are lost on restart - a deploy signs everyone out - and are not shared
   between pods. Every backend must stay at one replica until Redis is restored.
3. **Uploads are ephemeral.** Avatars and restaurant images are written to the pod
   filesystem. The `emptyDir` in `frontend/deployment.yml` makes that visible rather than
   hiding it in the image layer; they are still lost on restart and invisible to other
   replicas. Move to S3 and CloudFront.
4. **Rate limiting is per-pod.** The throttler uses in-memory storage, so the effective
   limit is the configured value multiplied by the replica count, and it resets on every
   deploy. Move it to Redis storage.
5. **Swagger is exposed unconditionally** at `/api/docs`, including in production.
6. **No automated tests.** The buildspecs run `test`, but every package's test script is
   still a no-op, so that gate currently passes unconditionally.

## Compression

An ALB does not compress responses. Next.js compresses its own output, so portal assets are
served gzipped; the NestJS services do not compress at all. Put CloudFront in front of the
ALB for compression and edge caching of API responses.
