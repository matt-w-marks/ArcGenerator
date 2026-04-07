#!/bin/bash
#
# grant-schema-privs.sh — fix the "permission denied for schema public" error
# that hits service identities running migrations against an Entra-only DB.
#
# Postgres 15+ removed the default CREATE grant on the public schema. Even
# though we ALTER DATABASE ... OWNER TO the service role, ownership of the
# database does NOT automatically grant CREATE on schema public — that's a
# separate grant. This script fixes the gap for each application database.
#
# Run as the admin identity (id-arcforge-pg-admin), which is the only role
# that can grant schema-level privileges in databases it doesn't own.
#
# Required environment variables (same as bootstrap):
#   PG_HOST          — Postgres FQDN
#   PG_ADMIN_NAME    — Admin Entra principal name
#   AZURE_CLIENT_ID  — Client ID of the admin MI
#
#   AUTH_IDENTITY_NAME    — e.g. id-arcforge-auth
#   METRICS_IDENTITY_NAME — e.g. id-arcforge-metrics
#   EXPORT_IDENTITY_NAME  — e.g. id-arcforge-export
#
set -euo pipefail

echo "[grant-schema-privs] starting at $(date -u +%FT%TZ)"

: "${PG_HOST:?PG_HOST is required}"
: "${PG_ADMIN_NAME:?PG_ADMIN_NAME is required}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"
: "${AUTH_IDENTITY_NAME:?AUTH_IDENTITY_NAME is required}"
: "${METRICS_IDENTITY_NAME:?METRICS_IDENTITY_NAME is required}"
: "${EXPORT_IDENTITY_NAME:?EXPORT_IDENTITY_NAME is required}"

# ── Fetch admin Entra access token ──────────────────────────────────────────
echo "[grant-schema-privs] fetching admin Entra access token"
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
  echo "[grant-schema-privs] FAILED to obtain access token. Response was:"
  echo "$TOKEN_JSON" | jq -C . 2>/dev/null || echo "$TOKEN_JSON"
  exit 1
fi
echo "[grant-schema-privs] token acquired"
export PGPASSWORD="$PG_TOKEN"

# ── Helper: connect to a specific DB as the admin identity ──────────────────
admin_psql() {
  local db="$1"
  shift
  psql "host=$PG_HOST user=$PG_ADMIN_NAME dbname=$db sslmode=require" -v ON_ERROR_STOP=1 "$@"
}

# ── arcgenerator_auth: auth identity owns it, needs CREATE on public ────────
echo "[grant-schema-privs] arcgenerator_auth: granting auth role schema privileges"
admin_psql arcgenerator_auth -c "GRANT ALL ON SCHEMA public TO \"$AUTH_IDENTITY_NAME\";"
admin_psql arcgenerator_auth -c "ALTER SCHEMA public OWNER TO \"$AUTH_IDENTITY_NAME\";"

# ── arcgenerator: metrics identity owns it, needs CREATE on public ──────────
echo "[grant-schema-privs] arcgenerator: granting metrics role schema privileges"
admin_psql arcgenerator -c "GRANT ALL ON SCHEMA public TO \"$METRICS_IDENTITY_NAME\";"
admin_psql arcgenerator -c "ALTER SCHEMA public OWNER TO \"$METRICS_IDENTITY_NAME\";"

# Export still needs SELECT (granted earlier in create-service-roles.sh, but
# re-applied here in case schema was reset). Default privileges from the new
# owner role need to grant future tables to export.
echo "[grant-schema-privs] arcgenerator: re-granting export read access"
admin_psql arcgenerator -c "GRANT USAGE ON SCHEMA public TO \"$EXPORT_IDENTITY_NAME\";"
admin_psql arcgenerator -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"$EXPORT_IDENTITY_NAME\";"
admin_psql arcgenerator -c "ALTER DEFAULT PRIVILEGES FOR ROLE \"$METRICS_IDENTITY_NAME\" IN SCHEMA public GRANT SELECT ON TABLES TO \"$EXPORT_IDENTITY_NAME\";"

# ── factory_logs: metrics owns it, all three services need INSERT ───────────
echo "[grant-schema-privs] factory_logs: granting metrics role schema privileges"
admin_psql factory_logs -c "GRANT ALL ON SCHEMA public TO \"$METRICS_IDENTITY_NAME\";"
admin_psql factory_logs -c "ALTER SCHEMA public OWNER TO \"$METRICS_IDENTITY_NAME\";"

echo "[grant-schema-privs] factory_logs: re-granting auth + export INSERT default"
admin_psql factory_logs -c "GRANT USAGE ON SCHEMA public TO \"$AUTH_IDENTITY_NAME\", \"$EXPORT_IDENTITY_NAME\";"
admin_psql factory_logs -c "ALTER DEFAULT PRIVILEGES FOR ROLE \"$METRICS_IDENTITY_NAME\" IN SCHEMA public GRANT INSERT ON TABLES TO \"$AUTH_IDENTITY_NAME\", \"$EXPORT_IDENTITY_NAME\";"

echo "[grant-schema-privs] complete."
