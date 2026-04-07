#!/bin/bash
#
# provision-admin.sh — insert (or update) the seed admin user in
# arcgenerator_auth.public.users.
#
# In an Entra-only world the user has no SQL password — password_hash
# is NULL and authentication happens via Cloudflare Access OTP, which
# the auth service maps to this row by email.
#
# Idempotent: if a user with the given email already exists, the role
# is set to ADMIN and password_hash left as-is. If not, a new row is
# inserted with a fresh UUID and password_hash NULL.
#
# Required environment variables:
#   PG_HOST          — Postgres FQDN
#   PG_ADMIN_NAME    — Admin Entra principal name
#   AZURE_CLIENT_ID  — Client ID of the admin MI
#   ADMIN_EMAIL      — Email address to provision (must match the email
#                      that Cloudflare Access will issue OTPs to)
#
set -euo pipefail

echo "[provision-admin] starting at $(date -u +%FT%TZ)"

: "${PG_HOST:?PG_HOST is required}"
: "${PG_ADMIN_NAME:?PG_ADMIN_NAME is required}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL is required}"

# ── Fetch admin Entra access token ──────────────────────────────────────────
echo "[provision-admin] fetching admin Entra access token"
RESOURCE="https://ossrdbms-aad.database.windows.net"

if [ -n "${IDENTITY_ENDPOINT:-}" ] && [ -n "${IDENTITY_HEADER:-}" ]; then
  TOKEN_URL="${IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=${RESOURCE}&client_id=${AZURE_CLIENT_ID}"
  TOKEN_JSON="$(curl -s --max-time 10 -H "X-IDENTITY-HEADER: ${IDENTITY_HEADER}" "$TOKEN_URL" || echo '{}')"
else
  TOKEN_URL="http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=${RESOURCE}&client_id=${AZURE_CLIENT_ID}"
  TOKEN_JSON="$(curl -s --max-time 10 -H 'Metadata: true' "$TOKEN_URL" || echo '{}')"
fi

PG_TOKEN="$(echo "$TOKEN_JSON" | jq -r '.access_token // empty')"
if [ -z "$PG_TOKEN" ]; then
  echo "[provision-admin] FAILED to obtain access token. Response was:"
  echo "$TOKEN_JSON" | jq -C . 2>/dev/null || echo "$TOKEN_JSON"
  exit 1
fi
echo "[provision-admin] token acquired"

export PGPASSWORD="$PG_TOKEN"
CONN="host=$PG_HOST user=$PG_ADMIN_NAME dbname=arcgenerator_auth sslmode=require"

# ── Check if user exists ───────────────────────────────────────────────────
EXISTING_ID="$(psql "$CONN" -v ON_ERROR_STOP=1 -tAc \
  "SELECT id FROM public.users WHERE email='$ADMIN_EMAIL' LIMIT 1")"

if [ -n "$EXISTING_ID" ]; then
  echo "[provision-admin] user $ADMIN_EMAIL already exists (id=$EXISTING_ID)"
  echo "[provision-admin] ensuring role=ADMIN"
  psql "$CONN" -v ON_ERROR_STOP=1 -c \
    "UPDATE public.users SET role='ADMIN', updated_at=NOW() WHERE id='$EXISTING_ID';"
else
  NEW_ID="$(cat /proc/sys/kernel/random/uuid)"
  echo "[provision-admin] creating user $ADMIN_EMAIL (id=$NEW_ID)"
  psql "$CONN" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO public.users (id, email, password_hash, role, failed_attempts, created_at, updated_at)
     VALUES ('$NEW_ID', '$ADMIN_EMAIL', NULL, 'ADMIN', 0, NOW(), NOW());"
fi

echo "[provision-admin] complete."
