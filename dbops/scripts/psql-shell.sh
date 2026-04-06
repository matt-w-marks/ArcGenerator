#!/bin/bash
#
# psql-shell.sh — open a psql session against the configured database.
#
# Required environment variables:
#   PG_HOST        — Postgres FQDN
#   PG_USER        — Postgres user (defaults to arcgen)
#   PG_PASSWORD    — Postgres password
#   PG_DB          — Database name (defaults to arcgenerator)
#
set -euo pipefail

: "${PG_HOST:?PG_HOST is required}"
: "${PG_PASSWORD:?PG_PASSWORD is required}"

PG_USER="${PG_USER:-arcgen}"
PG_DB="${PG_DB:-arcgenerator}"

export PGPASSWORD="$PG_PASSWORD"
exec psql "host=$PG_HOST user=$PG_USER dbname=$PG_DB sslmode=require"
