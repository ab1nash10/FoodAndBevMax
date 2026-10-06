# Admin portal image.
#
# Build from the repository root so the workspace is visible:
#   docker build -f frontend/Dockerfile -t aahar-admin-portal .
#
# The build is pruned to the portal and the three frontend packages it depends on, so a
# backend-only change does not invalidate these layers and the frontend pipeline can run
# on its own.
#
# NEXT_PUBLIC_* values are inlined into the bundle by Next at build time and cannot be
# overridden at runtime. None of them is required: the portal defaults to the /fandb routing
# prefix and calls the APIs on its own origin beneath it, so an image built with no build
# args at all is correct on any hostname. Pass them only to serve under a different prefix
# or to point at APIs on another domain - and then build one tag per environment.
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# turbo, installed once into a cached layer. Fetched by the prune step itself (`pnpm dlx`),
# it was downloaded again by every build, since that step reruns on any change to the
# source. Only the prune uses it, so the image that ships does not carry it.
FROM base AS tools
RUN npm install --global turbo@2.9.16

# ---- prune: reduce the workspace to just what the portal needs -------------------------
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
      echo "  docker build -f frontend/Dockerfile -t <image> ."; \
      echo ""; \
      echo "Do NOT cd into frontend/ first, and do NOT pass frontend/ as the context."; \
      echo "----------------------------------------------------------------"; \
      exit 1; }
RUN turbo prune @aahar/admin-portal --docker

# ---- install: lockfile-only layer, cached until a manifest changes ---------------------
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# ---- build ----------------------------------------------------------------------------
FROM installer AS builder
COPY --from=pruner /app/out/full/ .
# turbo prune only carries workspace packages, and every package tsconfig extends this one.
# Taken from the pruner stage rather than the build context: `pruner` is the only stage that
# reads the context, so the rest of the build works regardless of where it is invoked from.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_AUTH_API_URL
ARG NEXT_PUBLIC_USER_API_URL
ARG NEXT_PUBLIC_ORGANIZATION_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_AUTH_API_URL=$NEXT_PUBLIC_AUTH_API_URL
ENV NEXT_PUBLIC_USER_API_URL=$NEXT_PUBLIC_USER_API_URL
ENV NEXT_PUBLIC_ORGANIZATION_API_URL=$NEXT_PUBLIC_ORGANIZATION_API_URL

# `-r` builds the workspace packages in dependency order before the portal, so nothing
# relies on build output that happened to exist on a developer's machine.
RUN pnpm -r build

# ---- runtime --------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `output: 'standalone'` emits a self-contained server with only the traced dependencies.
COPY --from=builder --chown=node:node /app/frontend/apps/admin-portal/.next/standalone ./
COPY --from=builder --chown=node:node /app/frontend/apps/admin-portal/.next/static ./frontend/apps/admin-portal/.next/static
COPY --from=builder --chown=node:node /app/frontend/apps/admin-portal/public ./frontend/apps/admin-portal/public

# Uploads are written here at runtime. They are ephemeral per replica until the routes are
# moved to S3, so the directory is created with the right owner rather than failing later.
RUN mkdir -p /app/frontend/apps/admin-portal/public/uploads && chown -R node:node /app/frontend/apps/admin-portal/public/uploads

USER node
EXPOSE 3000

# basePath is baked into the bundle at build time, so it is carried into the runtime stage
# for the check: with /fandb the portal answers at /fandb/api/health, not /api/health.
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "const b=(process.env.NEXT_PUBLIC_BASE_PATH||'').replace(/\/+$/,'');fetch('http://127.0.0.1:3000'+b+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "frontend/apps/admin-portal/server.js"]
