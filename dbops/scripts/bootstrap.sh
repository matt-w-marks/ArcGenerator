#!/bin/bash
#
# bootstrap.sh — one-time database bootstrap.
#
# Creates the arcgen application user and the three databases owned by it.
# Idempotent: safe to re-run; existing objects are skipped with a notice.
#
# Required environment variables:
#   PG_HOST        — Postgres FQDN (private)
#   PG_ADMIN_USER  — Postgres admin username (e.g. arcforge_admin)
#   PG_ADMIN_PW    — Postgres admin password
#   ARCGEN_PW      — Password to assign to the new arcgen user
#
set -euo pipefail

: "${PG_HOST:?PG_HOST is required}"
: "${PG_ADMIN_USER:?PG_ADMIN_USER is required}"
: "${PG_ADMIN_PW:?PG_ADMIN_PW is required}"
: "${ARCGEN_PW:?ARCGEN_PW is required}"

export PGPASSWORD="$PG_ADMIN_PW"

CONN="host=$PG_HOST user=$PG_ADMIN_USER dbname=postgres sslmode=require"

echo "==> Creating arcgen user (if not exists)"
psql "$CONN" -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='arcgen'" | grep -q 1 || \
  psql "$CONN" -v ON_ERROR_STOP=1 -c "CREATE USER arcgen WITH PASSWORD '$ARCGEN_PW';"

echo "==> Updating arcgen password"
psql "$CONN" -v ON_ERROR_STOP=1 -c "ALTER USER arcgen WITH PASSWORD '$ARCGEN_PW';"

for db in arcgenerator arcgenerator_auth factory_logs; do
  echo "==> Creating database $db (if not exists)"
  psql "$CONN" -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    psql "$CONN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db OWNER arcgen;"
done

echo "==> Bootstrap complete."
