#!/bin/bash
# Creates the arcgenerator_auth database — auth service stores users, refresh tokens, invites here.
# Isolated from arcgenerator (business data) so backups, migrations, and blast radius are independent.
# Runs automatically on first container start via docker-entrypoint-initdb.d.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE arcgenerator_auth;
EOSQL

echo "arcgenerator_auth database created. Auth service will create its own tables on startup via Sequelize migrations."
