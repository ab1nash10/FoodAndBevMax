#!/usr/bin/env bash
# One-command fix for sign-in on the shared dev cluster. Run on a box with aws, kubectl and
# docker access (the platform Jenkins box), from the repository root:
#
#   bash scripts/fix-dev-login.sh
#
# What it does, and why (see infra/k8s/fandb-api-ingress-dev.yaml and backend/all-services.mjs):
#   layer 2: applies the ingress that routes /fandb/api/v1/* to the backend - without it every
#            browser API call lands on the portal and 404s;
#   layer 3: builds the backend with SERVICE=all (all three services in one image), pushes it
#            to ECR, and points the fandb-backend Deployment at it - the deployed image ran
#            user-service only, so /auth (sign-in) and /hospitals existed nowhere;
#   then verifies both from inside the cluster and prints PASS/FAIL per step.
#
# It touches only FandB objects (one ingress, one deployment); nothing else in the shared
# namespace. Safe to re-run: every step is idempotent.
set -euo pipefail

test -f pnpm-workspace.yaml -a -f backend/all-services.mjs || {
  echo "Run from the repository root, on a checkout that has backend/all-services.mjs"
  echo "(branch fandbdev or f-and-b-dev, commit e837405 or later)."
  exit 1
}

REGION="${AWS_REGION:-ap-south-1}"
NAMESPACE="${K8S_NAMESPACE:-dev}"
ACCOUNT="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
REGISTRY="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
TAG="fandb-api-all-$(git rev-parse --short HEAD)"
IMAGE="${REGISTRY}/max-ai-repo:${TAG}"

say()  { printf '\n== %s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILED=1; }
FAILED=0

# In-cluster curl, so the check does not depend on the box reaching the public ALB.
incurl() {
  kubectl -n "$NAMESPACE" run "fandb-fix-curl-$$" --rm -i --restart=Never --quiet \
    --image=curlimages/curl --command -- curl -s -m 10 "$@" 2>/dev/null
}

say "layer 2: route /fandb/api/v1 to the backend"
kubectl apply -f infra/k8s/fandb-api-ingress-dev.yaml
kubectl -n "$NAMESPACE" get ingress fandb-api-ext-ing >/dev/null && pass "ingress fandb-api-ext-ing exists"

say "layer 3: build the all-services backend image"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"
docker build -f backend/Dockerfile --target runner --build-arg SERVICE=all -t "$IMAGE" .
docker push "$IMAGE"
pass "pushed $IMAGE"

say "layer 3: point the fandb-backend Deployment at it"
CONTAINER="$(kubectl -n "$NAMESPACE" get deploy fandb-backend -o jsonpath='{.spec.template.spec.containers[0].name}')"
# The router listens on PORT; pin it to what the Service targets so nothing depends on a default.
TARGET_PORT="$(kubectl -n "$NAMESPACE" get svc fandb-backend-service -o jsonpath='{.spec.ports[0].targetPort}')"
case "$TARGET_PORT" in
  ''|*[!0-9]*) echo "note: service targetPort is '$TARGET_PORT' (named); leaving PORT env as deployed" ;;
  *) kubectl -n "$NAMESPACE" set env deployment/fandb-backend PORT="$TARGET_PORT" ;;
esac
kubectl -n "$NAMESPACE" set image "deployment/fandb-backend" "$CONTAINER=$IMAGE"
kubectl -n "$NAMESPACE" rollout status deployment/fandb-backend --timeout=300s

say "verify: the backend now carries all three services"
kubectl -n "$NAMESPACE" logs deploy/fandb-backend --tail=50 | grep -m1 backend_all_listening \
  && pass "supervisor started auth, user and organization" \
  || fail "backend_all_listening not in the pod log - is the new image running?"

HEALTH="$(incurl http://fandb-backend-service/fandb/api/v1/health || true)"
case "$HEALTH" in
  *organization-service*) pass "health answers through the router" ;;
  *) fail "health said: ${HEALTH:-<no response>}" ;;
esac

LOGIN_CODE="$(incurl -o /dev/null -w '%{http_code}' \
  -X POST http://fandb-backend-service/fandb/api/v1/auth/login-with-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","password":"wrong-password"}' || true)"
if [ "$LOGIN_CODE" = 401 ]; then
  pass "sign-in route exists (401 for wrong credentials, was 404)"
else
  fail "sign-in route returned $LOGIN_CODE, expected 401"
fi

say "verify: through the load balancer (needs ~1 minute after the ingress is first applied)"
ALB="${ALB_HOST:-k8s-devexternal-e58b3c8396-903158879.ap-south-1.elb.amazonaws.com}"
for _ in 1 2 3 4 5 6; do
  VIA_ALB="$(curl -s -m 10 "http://${ALB}/fandb/api/v1/health" || true)"
  case "$VIA_ALB" in *organization-service*) break ;; esac
  sleep 15
done
case "$VIA_ALB" in
  *organization-service*) pass "the browser path works: http://${ALB}/fandb/auth/login" ;;
  *) fail "ALB still answers: ${VIA_ALB:-<no response>} - run: kubectl -n $NAMESPACE describe ingress fandb-api-ext-ing" ;;
esac

if [ "$FAILED" = 0 ]; then
  say "all green - sign-in is routed. Email+password needs a seeded password; mobile OTP"
  echo "   additionally needs SMS_USERNAME/SMS_PASSWORD env on the backend."
else
  say "something failed above - send the full output back for diagnosis"
  exit 1
fi
