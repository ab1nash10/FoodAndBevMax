#!/usr/bin/env bash
#
# Builds an AAHAR image with the correct Docker build context.
#
# The images use `turbo prune`, which needs the whole workspace (pnpm-workspace.yaml, the
# lockfile and every package manifest) to work out what an app actually depends on. That
# means the build context must be the repository root, whatever directory you invoke this
# from. This script resolves the root itself, so a CI job cannot get it wrong.
#
# Usage:
#   scripts/docker-build.sh frontend [tag]
#   scripts/docker-build.sh auth-service [tag]
#   scripts/docker-build.sh user-service [tag]
#   scripts/docker-build.sh organization-service [tag]
#   scripts/docker-build.sh migrate [tag]
#
# From Jenkins, call it from the workspace root - it does not matter which directory the
# stage is in, because it cd's to the repository root itself:
#   sh './scripts/docker-build.sh frontend $GIT_COMMIT'
set -euo pipefail

TARGET="${1:-}"
TAG="${2:-latest}"

if [ -z "$TARGET" ]; then
  echo "usage: scripts/docker-build.sh <frontend|auth-service|user-service|organization-service|migrate> [tag]" >&2
  exit 2
fi

# Resolve the repository root from this script's own location, so the context is correct
# no matter where the caller happens to be.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f pnpm-workspace.yaml ] || [ ! -f package.json ]; then
  echo "ERROR: $ROOT does not look like the repository root." >&2
  exit 1
fi

REGISTRY="${REGISTRY:-}"
# One shared ECR repository holds all five images; the app is encoded in the tag prefix,
# so `max-ai-repo:auth-service-<sha>` and `max-ai-repo:admin-portal-<sha>` sit side by side.
ECR_REPOSITORY="${ECR_REPOSITORY:-max-ai-repo}"

# $1 = tag prefix naming which app this image holds.
image_ref() {
  if [ -n "$REGISTRY" ]; then
    printf '%s/%s:%s-%s' "$REGISTRY" "$ECR_REPOSITORY" "$1" "$TAG"
  else
    printf '%s:%s-%s' "$ECR_REPOSITORY" "$1" "$TAG"
  fi
}

case "$TARGET" in
  frontend)
    IMAGE="$(image_ref admin-portal)"
    echo "building $IMAGE   (context: $ROOT)"
    docker build -f frontend/Dockerfile \
      --build-arg NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-}" \
      --build-arg NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-}" \
      --build-arg NEXT_PUBLIC_AUTH_API_URL="${NEXT_PUBLIC_AUTH_API_URL:-}" \
      --build-arg NEXT_PUBLIC_USER_API_URL="${NEXT_PUBLIC_USER_API_URL:-}" \
      --build-arg NEXT_PUBLIC_ORGANIZATION_API_URL="${NEXT_PUBLIC_ORGANIZATION_API_URL:-}" \
      -t "$IMAGE" .
    ;;

  auth-service | user-service | organization-service)
    IMAGE="$(image_ref "$TARGET")"
    echo "building $IMAGE   (context: $ROOT)"
    docker build -f backend/Dockerfile --target runner \
      --build-arg SERVICE="$TARGET" -t "$IMAGE" .
    ;;

  migrate)
    IMAGE="$(image_ref migrate)"
    echo "building $IMAGE   (context: $ROOT)"
    docker build -f backend/Dockerfile --target migrate \
      --build-arg SERVICE=user-service -t "$IMAGE" .
    ;;

  *)
    echo "unknown target: $TARGET" >&2
    exit 2
    ;;
esac

echo "built $IMAGE"
