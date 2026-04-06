#!/bin/bash
#
# bootstrap.sh — one-time database bootstrap for Entra-only Postgres Flex.
#
# Authenticates to Postgres using a Microsoft Entra access token fetched from
# IMDS. The script must run as a Container Apps Job with a user-assigned
# managed identity attached, and that identity must already be registered as
# the Microsoft Entra admin on the Postgres server.
#
# Creates the three application databases owned by the admin identity. Service
# roles for the individual services (auth, metrics, export) are created in a
# separate script later, after their managed identities exist.
#
# Required environment variables:
#   PG_HOST          — Postgres FQDN (e.g. arcforge-psql-prd.postgres.database.azure.com)
#   PG_ADMIN_NAME    — The exact name of the admin Entra principal as known to
#                      Postgres. For a user-assigned MI this is the identity's
#                      display name (e.g. "id-arcforge-pg-admin").
#   AZURE_CLIENT_ID  — Client ID of the user-assigned managed identity to use
#                      (DefaultAzureCredential needs this when multiple MIs
#                      are attached or to disambiguate).
#
set -euo pipefail

echo "[bootstrap] starting at $(date -u +%FT%TZ)"
echo "[bootstrap] PG_HOST=${PG_HOST:-<unset>}"
echo "[bootstrap] PG_ADMIN_NAME=${PG_ADMIN_NAME:-<unset>}"
echo "[bootstrap] AZURE_CLIENT_ID=${AZURE_CLIENT_ID:-<unset>}"
echo "[bootstrap] which psql: $(which psql)"
psql --version

: "${PG_HOST:?PG_HOST is required}"
: "${PG_ADMIN_NAME:?PG_ADMIN_NAME is required}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"

# ── Fetch an Entra access token from the Azure IMDS endpoint ────────────────
# IMDS is reachable at the link-local address 169.254.169.254 from any compute
# inside Azure. Container Apps proxies it to its workloads. The audience must
# be the OSS RDBMS resource URL.
echo "[bootstrap] fetching Entra access token from IMDS"
IMDS_URL="http://169.254.169.254/metadata/identity/oauth2/token"
IMDS_PARAMS="api-version=2018-02-01&resource=https%3A%2F%2Fossrdbms-aad.database.windows.net&client_id=${AZURE_CLIENT_ID}"

TOKEN_JSON="$(curl -s --max-time 10 -H 'Metadata: true' "${IMDS_URL}?${IMDS_PARAMS}")"
PG_TOKEN="$(echo "$TOKEN_JSON" | jq -r '.access_token // empty')"

if [ -z "$PG_TOKEN" ]; then
  echo "[bootstrap] FAILED to obtain access token. IMDS response was:"
  echo "$TOKEN_JSON" | jq -C . || echo "$TOKEN_JSON"
  exit 1
fi
echo "[bootstrap] token acquired (length: ${#PG_TOKEN})"

# ── Connect to Postgres using the token as the password ────────────────────
export PGPASSWORD="$PG_TOKEN"
CONN="host=$PG_HOST user=$PG_ADMIN_NAME dbname=postgres sslmode=require"

# ── Create the three application databases (idempotent) ────────────────────
for db in arcgenerator arcgenerator_auth factory_logs; do
  echo "[bootstrap] ensuring database $db exists"
  EXISTS="$(psql "$CONN" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_database WHERE datname='$db'")"
  if [ "$EXISTS" = "1" ]; then
    echo "[bootstrap]   $db already exists — skipping"
  else
    psql "$CONN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db;"
    echo "[bootstrap]   $db created"
  fi
done

echo "[bootstrap] complete."
