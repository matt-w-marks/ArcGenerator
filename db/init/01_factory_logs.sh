#!/bin/bash
# Creates the factory_logs database and flg_entries table on the same PostgreSQL instance.
# Runs automatically on first container start via docker-entrypoint-initdb.d.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE factory_logs;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "factory_logs" <<-EOSQL
    CREATE TABLE IF NOT EXISTS flg_entries (
        id          BIGSERIAL PRIMARY KEY,
        app_label   VARCHAR(64)  NOT NULL,
        level       VARCHAR(16)  NOT NULL,
        message     TEXT         NOT NULL,
        context     JSONB,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX idx_flg_entries_app_label ON flg_entries (app_label);
    CREATE INDEX idx_flg_entries_created_at ON flg_entries (created_at DESC);
EOSQL

echo "factory_logs database and flg_entries table created."
