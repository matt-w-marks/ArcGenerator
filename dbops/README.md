# dbops

Container image with `psql` and helper scripts for running database
operations against the private Azure Postgres Flexible Server.

The DB has no public endpoint, so all DB ops must run from inside the
peered VNet — typically as a one-shot Container Apps Job in `arcforge-cae`.

## Image

`arcforgeacrprd.azurecr.io/dbops:<tag>`

Built and pushed automatically by `.github/workflows/build-images.yml` on
every push to `main` that touches `dbops/**`.

## Scripts

| Script | Purpose | Required env vars |
|---|---|---|
| `bootstrap.sh` | Create the `arcgen` user + the three application databases | `PG_HOST`, `PG_ADMIN_USER`, `PG_ADMIN_PW`, `ARCGEN_PW` |
| `psql-shell.sh` | Open an interactive psql session | `PG_HOST`, `PG_USER` (default `arcgen`), `PG_PASSWORD`, `PG_DB` (default `arcgenerator`) |

Add new scripts under `scripts/` and they'll be available in the next image build.

## Running a script via Container Apps Job

Portal → `arcforge-cae` → Jobs → Create

| Field | Value |
|---|---|
| Image | `arcforgeacrprd.azurecr.io/dbops:prod` |
| Command override | `/bin/bash` |
| Arguments override | `bootstrap.sh` (or whichever script) |
| Trigger | Manual |
| Replica timeout | 300 |
| Retries | 0 |

Set the env vars in the job's environment variable section. After the job
completes, check **Execution history** → **Console logs**.
