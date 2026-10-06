# Backend service image, one Dockerfile for all three NestJS services.
#
# Build from the repository root so the workspace is visible:
#   docker build -f backend/Dockerfile --build-arg SERVICE=user-service -t aahar-user-service .
#
# SERVICE is one of: auth-service | user-service | organization-service | all
#
# `all` bundles the three services into one image whose entrypoint (backend/all-services.mjs)
# runs them as child processes behind a single port, routed by path. It exists for pipelines
# that deploy exactly one backend image per application; the Helm chart's one-image-per-service
# deployment remains the norm everywhere else.
#
# The build is pruned to the three backend services and the packages they depend on, so a
# frontend-only change does not invalidate these layers and the backend pipeline can run
# on its own. The pruned workspace, its install and its compile are the same whatever
# SERVICE is, so building the four backend images one after another (as the Jenkinsfile
# does) installs and compiles once and reuses those layers for the other three.
#
# Two targets:
#   --target runner   (default) the service itself
#   --target migrate  the Prisma CLI image used by the migration Job and admin scripts
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# turbo, installed once into a cached layer. Fetched by the prune step itself (`pnpm dlx`),
# it was downloaded again by every build, since that step reruns on any change to the
# source. Only the prune uses it, so the images that ship do not carry it.
FROM base AS tools
RUN npm install --global turbo@2.9.16

# ---- prune: reduce the workspace to just what the backend needs ------------------------
FROM tools AS pruner
COPY . .
# Fail immediately and legibly if the build context is not the repository root. turbo prune
# needs the whole workspace (pnpm-workspace.yaml, the lockfile and every package manifest),
# so a narrower context otherwise dies later with a confusing "cannot read package.json".
RUN test -f pnpm-workspace.yaml -a -f package.json || { \
      echo "----------------------------------------------------------------"; \
      echo "ERROR: the Docker build context is not the repository root."; \
      echo "pnpm-workspace.yaml / package.json are missing from the context."; \
      echo ""; \
      echo "Build from the repository root, passing the Dockerfile with -f:"; \
      echo "  docker build -f backend/Dockerfile --build-arg SERVICE=user-service -t <image> ."; \
      echo ""; \
      echo "Do NOT cd into backend/ first, and do NOT pass backend/ as the context."; \
      echo "----------------------------------------------------------------"; \
      exit 1; }
# SERVICE is deliberately not in scope yet: a build arg in scope is part of every following
# RUN's cache key, which would give each service its own copy of the prune, install and build.
RUN turbo prune @aahar/auth-service @aahar/user-service @aahar/organization-service --docker
# Reject a bad SERVICE before anything else is built: every target depends on this stage.
# /fandb in the URLs is the platform route prefix, not a service name.
ARG SERVICE
RUN case "$SERVICE" in \
      all|auth-service|user-service|organization-service) ;; \
      *) echo "ERROR: SERVICE='$SERVICE' is not an AAHAR backend service."; \
         echo "Valid: auth-service | user-service | organization-service | all"; \
         echo "SERVICE is the --build-arg on the docker build step in the CI job."; \
         exit 1;; \
    esac

# ---- install --------------------------------------------------------------------------
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------------------
FROM installer AS builder
# turbo prune only carries workspace packages. These live at the repository root: every
# package tsconfig extends the base, the services need a generated Prisma client, and the
# Prisma CLI reads the database URL and migrations path from prisma.config.mjs.
# Taken from the pruner stage rather than the build context: `pruner` is the only stage that
# reads the context, so the rest of the build works regardless of where it is invoked from.
# The client is generated before the source is copied in: it depends only on prisma/ and
# lands in node_modules, so a code change reuses this layer instead of generating it again.
COPY --from=pruner /app/prisma ./prisma
COPY --from=pruner /app/prisma.config.mjs ./prisma.config.mjs
RUN pnpm exec prisma generate --schema prisma/schema.prisma
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
# `-r` builds every package in the pruned workspace in dependency order. Filtering to just
# the service would compile it against @aahar/auth's TypeScript sources (its `types` entry)
# while never emitting the `dist/index.js` its `main` points at, so the image builds and
# then dies at startup with MODULE_NOT_FOUND.
RUN pnpm -r build

# ---- migration / admin tooling image ---------------------------------------------------
# Carries the Prisma CLI, the schema, the migrations and the seed scripts. Used by the
# migration Job and by `pnpm admin:password`.
FROM base AS migrate
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=builder --chown=node:node /app/backend/packages ./backend/packages
# pnpm is the entrypoint of this image, and corepack fetches it from the npm registry the
# first time it runs. Left like that, the migration and seed hooks need internet egress
# from the cluster at deploy time and fail outright without it. Fetch it here instead,
# into a directory the runtime `node` user can read (corepack's default cache is under
# $HOME, so a root-time prepare would be invisible to `node`), and refuse any download
# at runtime so a regression fails fast rather than hanging on a blocked socket.
# The version comes from the packageManager pin in package.json, copied just above.
# The runner images are not affected: they exec node directly and never invoke pnpm.
ENV COREPACK_HOME=/corepack
RUN corepack prepare --activate && chmod -R a+rX /corepack
ENV COREPACK_ENABLE_NETWORK=0
USER node
CMD ["pnpm", "db:deploy"]

# ---- runtime --------------------------------------------------------------------------
FROM base AS runner
ARG SERVICE
ENV NODE_ENV=production
# The workspace layout is preserved on purpose. pnpm resolves a package's dependencies
# through its own node_modules, which symlinks into the root store, so flattening the
# service into / would break every runtime import.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/backend/packages ./backend/packages
# All three compiled services come along, a few MB, so this layer is shared by every backend
# image; SERVICE (below) decides which one runs.
COPY --from=builder --chown=node:node /app/backend/services ./backend/services
# From the pruner: turbo prune carries only workspace packages, and this root-level script is
# the SERVICE=all entrypoint (a harmless single file in single-service images).
COPY --from=pruner --chown=node:node /app/backend/all-services.mjs ./backend/all-services.mjs
# Schema, migrations and seed. SERVICE=all applies them itself on startup, because the
# one-image pipelines it exists for have no separate migration step; for single-service
# images the Helm chart's hooks do it and these few files go unused.
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.mjs ./prisma.config.mjs

# ARG is build-time only, so the entrypoint reads the name from the environment instead.
ENV SERVICE=${SERVICE}

USER node

# PORT and BASE_PATH both come from the environment, so the check has to be built at run
# time: with BASE_PATH=/fandb the service answers at /fandb/api/v1/health, not /api/v1/health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "const b=(process.env.BASE_PATH||'').replace(/\/+$/,'');fetch('http://127.0.0.1:'+(process.env.PORT||4000)+b+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `exec` so node replaces the shell and becomes PID 1, otherwise SIGTERM never reaches it
# and enableShutdownHooks() cannot drain in-flight requests.
CMD ["sh", "-c", "if [ \"$SERVICE\" = all ]; then exec node backend/all-services.mjs; else exec node \"backend/services/$SERVICE/dist/main.js\"; fi"]
