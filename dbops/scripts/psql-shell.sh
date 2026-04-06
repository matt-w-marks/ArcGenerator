#!/bin/bash
#
# psql-shell.sh — open a psql session against the configured database using
# Microsoft Entra token auth (matches the bootstrap script's auth method).
#
# Required environment variables:
#   PG_HOST          — Postgres FQDN
#   PG_USER          — Postgres user (must match an Entra principal mapped to
#                      a Postgres role; e.g. "id-arcforge-pg-admin")
#   AZURE_CLIENT_ID  — Client ID of the user-assigned managed identity to use
#   PG_DB            — Database name (defaults to postgres)
#
set -euo pipefail

: "${PG_HOST:?PG_HOST is required}"
: "${PG_USER:?PG_USER is required}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"

PG_DB="${PG_DB:-postgres}"

RESOURCE="https://ossrdbms-aad.database.windows.net"

if [ -n "${IDENTITY_ENDPOINT:-}" ] && [ -n "${IDENTITY_HEADER:-}" ]; then
  TOKEN_URL="${IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=${RESOURCE}&client_id=${AZURE_CLIENT_ID}"
  TOKEN_JSON="$(curl -s --max-time 10 -H "X-IDENTITY-HEADER: ${IDENTITY_HEADER}" "$TOKEN_URL" || echo '{}')"
else
  IMDS_URL="http://169.254.169.254/metadata/identity/oauth2/token"
  TOKEN_URL="${IMDS_URL}?api-version=2018-02-01&resource=${RESOURCE}&client_id=${AZURE_CLIENT_ID}"
  TOKEN_JSON="$(curl -s --max-time 10 -H 'Metadata: true' "$TOKEN_URL" || echo '{}')"
fi

PG_TOKEN="$(echo "$TOKEN_JSON" | jq -r '.access_token // empty')"

if [ -z "$PG_TOKEN" ]; then
  echo "FAILED to obtain Entra access token" >&2
  exit 1
fi

export PGPASSWORD="$PG_TOKEN"
exec psql "host=$PG_HOST user=$PG_USER dbname=$PG_DB sslmode=require"
