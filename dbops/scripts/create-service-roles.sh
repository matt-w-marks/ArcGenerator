#!/bin/bash
#
# create-service-roles.sh — register service managed identities as Postgres
# roles and grant the right ownership/privileges per database.
#
# Idempotent: safe to re-run. Uses pgaadauth_create_principal_with_oid which
# is the Entra-aware role creation function on Azure Postgres Flex.
#
# Required environment variables:
#   PG_HOST                — Postgres FQDN
#   PG_ADMIN_NAME          — Admin Entra principal name (e.g. id-arcforge-pg-admin)
#   AZURE_CLIENT_ID        — Client ID of the admin MI (this is what runs the script)
#
#   AUTH_IDENTITY_NAME     — Display name of auth service MI (e.g. id-arcforge-auth)
#   AUTH_IDENTITY_OID      — Principal (object) ID of auth MI
#
#   METRICS_IDENTITY_NAME  — Display name of metrics service MI
#   METRICS_IDENTITY_OID   — Principal (object) ID of metrics MI
#
#   EXPORT_IDENTITY_NAME   — Display name of export service MI
#   EXPORT_IDENTITY_OID    — Principal (object) ID of export MI
#
set -euo pipefail

echo "[create-service-roles] starting at $(date -u +%FT%TZ)"

: "${PG_HOST:?PG_HOST is required}"
: "${PG_ADMIN_NAME:?PG_ADMIN_NAME is required}"
: "${AZURE_CLIENT_ID:?AZURE_CLIENT_ID is required}"
: "${AUTH_IDENTITY_NAME:?AUTH_IDENTITY_NAME is required}"
: "${AUTH_IDENTITY_OID:?AUTH_IDENTITY_OID is required}"
: "${METRICS_IDENTITY_NAME:?METRICS_IDENTITY_NAME is required}"
: "${METRICS_IDENTITY_OID:?METRICS_IDENTITY_OID is required}"
: "${EXPORT_IDENTITY_NAME:?EXPORT_IDENTITY_NAME is required}"
: "${EXPORT_IDENTITY_OID:?EXPORT_IDENTITY_OID is required}"

# ── Fetch admin Entra access token ──────────────────────────────────────────
echo "[create-service-roles] fetching admin Entra access token"
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
  echo "[create-service-roles] FAILED to obtain access token. Response was:"
  echo "$TOKEN_JSON" | jq -C . 2>/dev/null || echo "$TOKEN_JSON"
  exit 1
fi
echo "[create-service-roles] token acquired"

export PGPASSWORD="$PG_TOKEN"
ADMIN_CONN="host=$PG_HOST user=$PG_ADMIN_NAME dbname=postgres sslmode=require"

# ── Helper: register a service identity as a Postgres role ──────────────────
# pgaadauth_create_principal_with_oid signature:
#   (role_name text, oid text, principal_type text, is_admin bool, is_mfa bool)
# principal_type is 'user', 'group', or 'service' (managed identity is 'service')
register_role() {
  local name="$1"
  local oid="$2"
  echo "[create-service-roles] registering role: $name (oid: $oid)"

  EXISTS="$(psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -tAc "SELECT 1 FROM pg_roles WHERE rolname='$name'")"
  if [ "$EXISTS" = "1" ]; then
    echo "[create-service-roles]   $name already exists -- skipping creation"
  else
    psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -c \
      "SELECT * FROM pgaadauth_create_principal_with_oid('$name', '$oid', 'service', false, false);"
    echo "[create-service-roles]   $name created"
  fi
}

# ── Register the three service roles ────────────────────────────────────────
register_role "$AUTH_IDENTITY_NAME"    "$AUTH_IDENTITY_OID"
register_role "$METRICS_IDENTITY_NAME" "$METRICS_IDENTITY_OID"
register_role "$EXPORT_IDENTITY_NAME"  "$EXPORT_IDENTITY_OID"

# ── Grant database ownership and privileges ─────────────────────────────────
# auth service: full owner of arcgenerator_auth (runs Sequelize migrations)
echo "[create-service-roles] granting auth service ownership of arcgenerator_auth"
psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE arcgenerator_auth OWNER TO \"$AUTH_IDENTITY_NAME\";"

# metrics service: full owner of arcgenerator (runs Alembic migrations)
echo "[create-service-roles] granting metrics service ownership of arcgenerator"
psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE arcgenerator OWNER TO \"$METRICS_IDENTITY_NAME\";"

# export service: connect-only on arcgenerator (read existing tables, no DDL)
echo "[create-service-roles] granting export service CONNECT on arcgenerator"
psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT CONNECT ON DATABASE arcgenerator TO \"$EXPORT_IDENTITY_NAME\";"

# Inside arcgenerator: grant SELECT on existing + future tables to export role
echo "[create-service-roles] granting export service SELECT on arcgenerator tables"
ARCGEN_CONN="host=$PG_HOST user=$PG_ADMIN_NAME dbname=arcgenerator sslmode=require"
psql "$ARCGEN_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT USAGE ON SCHEMA public TO \"$EXPORT_IDENTITY_NAME\";"
psql "$ARCGEN_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"$EXPORT_IDENTITY_NAME\";"
psql "$ARCGEN_CONN" -v ON_ERROR_STOP=1 -c \
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO \"$EXPORT_IDENTITY_NAME\";"

# factory_logs: all three services need INSERT on the audit table.
# We grant CONNECT now and let the metrics service own the schema (since
# it's the only service that defines factory_log table structure).
echo "[create-service-roles] setting up factory_logs ownership and access"
psql "$ADMIN_CONN" -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE factory_logs OWNER TO \"$METRICS_IDENTITY_NAME\";"

LOGS_CONN="host=$PG_HOST user=$PG_ADMIN_NAME dbname=factory_logs sslmode=require"
psql "$LOGS_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT CONNECT ON DATABASE factory_logs TO \"$AUTH_IDENTITY_NAME\";"
psql "$LOGS_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT CONNECT ON DATABASE factory_logs TO \"$EXPORT_IDENTITY_NAME\";"
psql "$LOGS_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT USAGE ON SCHEMA public TO \"$AUTH_IDENTITY_NAME\";"
psql "$LOGS_CONN" -v ON_ERROR_STOP=1 -c \
  "GRANT USAGE ON SCHEMA public TO \"$EXPORT_IDENTITY_NAME\";"
# auth + export need INSERT on log tables created by metrics
psql "$LOGS_CONN" -v ON_ERROR_STOP=1 -c \
  "ALTER DEFAULT PRIVILEGES FOR ROLE \"$METRICS_IDENTITY_NAME\" IN SCHEMA public GRANT INSERT ON TABLES TO \"$AUTH_IDENTITY_NAME\", \"$EXPORT_IDENTITY_NAME\";"

echo "[create-service-roles] complete."
