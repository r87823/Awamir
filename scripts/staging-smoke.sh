#!/usr/bin/env bash
set -euo pipefail

api_base="${AWAMIR_STAGING_API_BASE_URL:-}"

if [[ -z "$api_base" && -f ".env.staging" ]]; then
  domain="$(grep -E '^STAGING_API_DOMAIN=' .env.staging | tail -n 1 | cut -d '=' -f 2-)"
  if [[ -n "$domain" ]]; then
    api_base="https://${domain}"
  fi
fi

if [[ -z "$api_base" ]]; then
  echo "Set AWAMIR_STAGING_API_BASE_URL or STAGING_API_DOMAIN in .env.staging" >&2
  exit 1
fi

echo "Smoke testing ${api_base}"

curl -fsS "${api_base}/health/live" >/tmp/awamir-staging-live.json
echo "liveness ok"

curl -fsS "${api_base}/health/ready" >/tmp/awamir-staging-ready.json
echo "readiness ok"

if [[ -n "${AWAMIR_STAGING_USERNAME:-}" && -n "${AWAMIR_STAGING_PASSWORD:-}" ]]; then
  curl -fsS \
    -H "content-type: application/json" \
    -d "{\"username\":\"${AWAMIR_STAGING_USERNAME}\",\"password\":\"${AWAMIR_STAGING_PASSWORD}\"}" \
    "${api_base}/auth/login" >/tmp/awamir-staging-login.json
  echo "login ok"
else
  echo "login skipped: set AWAMIR_STAGING_USERNAME and AWAMIR_STAGING_PASSWORD"
fi

if [[ -n "${AWAMIR_STAGING_TOKEN:-}" ]]; then
  curl -fsS \
    -H "authorization: Bearer ${AWAMIR_STAGING_TOKEN}" \
    -X POST \
    "${api_base}/erpnext/validate-connection" >/tmp/awamir-staging-erpnext.json
  echo "erpnext validation ok"
else
  echo "erpnext validation skipped: set AWAMIR_STAGING_TOKEN"
fi

echo "staging smoke completed"
