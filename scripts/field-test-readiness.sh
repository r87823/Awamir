#!/usr/bin/env bash
set -euo pipefail

api_base="${AWAMIR_FIELD_TEST_API_BASE_URL:-}"

if [[ -z "$api_base" && -f ".env.staging" ]]; then
  domain="$(grep -E '^STAGING_API_DOMAIN=' .env.staging | tail -n 1 | cut -d '=' -f 2-)"
  if [[ -n "$domain" ]]; then
    api_base="https://${domain}"
  fi
fi

if [[ -z "$api_base" ]]; then
  echo "Set AWAMIR_FIELD_TEST_API_BASE_URL or STAGING_API_DOMAIN in .env.staging" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
chmod 700 "$tmp_dir"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Field-test readiness checks for ${api_base}"

check_public() {
  local label="$1"
  local path="$2"
  curl -fsS "${api_base}${path}" >"${tmp_dir}/${label}.json"
  echo "${label} ok"
}

check_with_token() {
  local label="$1"
  local method="$2"
  local path="$3"
  local curl_config="${tmp_dir}/${label}.curl"
  {
    printf 'silent\n'
    printf 'show-error\n'
    printf 'fail\n'
    printf 'request = "%s"\n' "$method"
    printf 'url = "%s%s"\n' "$api_base" "$path"
    printf 'header = "authorization: Bearer %s"\n' "$AWAMIR_FIELD_TEST_TOKEN"
    printf 'header = "content-type: application/json"\n'
    printf 'output = "%s/%s.json"\n' "$tmp_dir" "$label"
  } >"$curl_config"
  chmod 600 "$curl_config"
  curl --config "$curl_config"
  echo "${label} ok"
}

check_login() {
  local payload="${tmp_dir}/login-payload.json"
  printf '{"username":"%s","password":"%s"}' \
    "$AWAMIR_FIELD_TEST_USERNAME" \
    "$AWAMIR_FIELD_TEST_PASSWORD" >"$payload"
  chmod 600 "$payload"
  curl -fsS \
    -H "content-type: application/json" \
    --data @"$payload" \
    "${api_base}/auth/login" >"${tmp_dir}/login.json"
  echo "login ok"
}

check_public "health-live" "/health/live"
check_public "health-ready" "/health/ready"

if [[ -n "${AWAMIR_FIELD_TEST_USERNAME:-}" && -n "${AWAMIR_FIELD_TEST_PASSWORD:-}" ]]; then
  check_login
else
  echo "login skipped: set AWAMIR_FIELD_TEST_USERNAME and AWAMIR_FIELD_TEST_PASSWORD"
fi

if [[ -n "${AWAMIR_FIELD_TEST_TOKEN:-}" ]]; then
  check_with_token "credential-hygiene" "GET" "/admin/security/credential-hygiene"
  check_with_token "admin-settings" "GET" "/admin/settings"
  check_with_token "orders-status-report" "GET" "/reports/orders/status"
  check_with_token "erpnext-validate" "POST" "/erpnext/validate-connection"
else
  echo "admin/report/ERPNext checks skipped: set AWAMIR_FIELD_TEST_TOKEN"
fi

echo "field-test readiness completed"
