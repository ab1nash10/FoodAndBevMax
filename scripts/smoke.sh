#!/usr/bin/env bash
#
# Post-deploy smoke test. Checks that the load balancer routes each path to the component
# that actually serves it.
#
# The failure this exists to catch: when the API ingress rules are missing, every
# /fandb/api/v1/* request falls through to the portal's catch-all and Next.js answers with
# an HTML 404. The status code alone looks like "route not found on the service", so the
# usual reaction is to hunt for a bug in NestJS - but no service was ever reached. The
# services only ever return JSON, so an HTML body on an API path means the request never
# got to one.
#
# Usage:
#   scripts/smoke.sh https://k8s-devexternal-e58b3c8396-903158879.ap-south-1.elb.amazonaws.com
#
# Exits non-zero if any API path is answered by the portal, so CI can gate on it.
set -uo pipefail

BASE="${1:-}"
PREFIX="${BASE_PATH:-/fandb}"

if [ -z "$BASE" ]; then
  echo "usage: scripts/smoke.sh <base-url>   e.g. https://my-alb.ap-south-1.elb.amazonaws.com" >&2
  exit 2
fi

BASE="${BASE%/}"
failures=0

# $1 = path, $2 = expected body kind (json|html), $3 = method
check() {
  local path="$1" expect="$2" method="${3:-GET}" code ctype kind
  local headers
  headers="$(mktemp)"

  code="$(curl -sk -o /dev/null -D "$headers" -w '%{http_code}' -X "$method" "$BASE$path" || echo 000)"
  ctype="$(grep -i '^content-type:' "$headers" | tr -d '\r' | cut -d' ' -f2- | cut -d';' -f1)"
  rm -f "$headers"

  case "$ctype" in
    application/json) kind=json ;;
    text/html) kind=html ;;
    *) kind="${ctype:-none}" ;;
  esac

  if [ "$kind" = "$expect" ]; then
    printf '  ok    %-46s %s %s\n' "$path" "$code" "$kind"
  else
    printf '  FAIL  %-46s %s %s (expected %s)\n' "$path" "$code" "$kind" "$expect"
    failures=$((failures + 1))
  fi
}

echo "smoke test against $BASE$PREFIX"
echo
echo "portal (HTML pages and its own route handlers):"
check "$PREFIX/auth/login" html
check "$PREFIX/api/health" json

echo
echo "API (JSON from the NestJS services - HTML here means the portal answered):"
# Unauthenticated on purpose. 401 or 400 is a pass: the service was reached and replied.
check "$PREFIX/api/v1/health" json
check "$PREFIX/api/v1/auth/login-with-password" json POST
check "$PREFIX/api/v1/users" json
check "$PREFIX/api/v1/roles" json

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed."
  echo
  echo "If the API paths returned HTML, the ingress has no API rules and everything under"
  echo "$PREFIX is reaching the portal. Check that the chart's API Ingress exists and that no"
  echo "older ingress is competing for the same ALB group order:"
  echo "  kubectl -n dev get ingress"
  echo "  kubectl -n dev describe ingress fandb-api"
  echo "  kubectl get ingress -A -o wide | grep dev-external"
  exit 1
fi

echo "all checks passed."
