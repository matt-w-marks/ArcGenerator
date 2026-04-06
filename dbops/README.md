# dbops

Container image with `psql` and helper scripts for running database
operations against the private Azure Postgres Flexible Server.

The DB has no public endpoint **and uses Microsoft Entra authentication only**,
so all DB ops must run from inside the peered VNet, as a Container Apps Job
with a managed identity attached.

## Image

`arcforgeacrprd.azurecr.io/dbops:<tag>`

Built and pushed automatically by `.github/workflows/build-images.yml` on
every push to `main` that touches `dbops/**`.

## Authentication model

Postgres Flex is configured for **Microsoft Entra authentication only**. There
are no SQL passwords. Each script:

1. Fetches an Entra access token from the IMDS endpoint at
   `169.254.169.254`, scoped to the `https://ossrdbms-aad.database.windows.net`
   resource.
2. Uses the token as the password to connect via `psql`.
3. Connects as the user-assigned managed identity attached to the job.

For this to work, the managed identity attached to the job must already be
registered as a Microsoft Entra admin (or a granted role) on the Postgres
server.

## Scripts

| Script | Purpose | Required env vars |
|---|---|---|
| `bootstrap.sh` | Create the three application databases (`arcgenerator`, `arcgenerator_auth`, `factory_logs`) owned by the admin identity. Idempotent. | `PG_HOST`, `PG_ADMIN_NAME`, `AZURE_CLIENT_ID` |
| `psql-shell.sh` | Open an interactive psql session as the configured identity. Useful for ad-hoc queries via `--command` or interactive job exec. | `PG_HOST`, `PG_USER`, `AZURE_CLIENT_ID`, `PG_DB` (optional) |

Add new scripts under `scripts/` and they'll be available in the next image build.

## Running a script via Container Apps Job

Portal → top search → **Container App Jobs** → **+ Create**

| Field | Value |
|---|---|
| Resource group | `rg-arcforge-prd-shared` (recommended) |
| Container Apps environment | `arcforge-cae-prd` |
| Job name | `arcgen-dbops-bootstrap` |
| Trigger type | Manual |
| Image | `arcforgeacrprd.azurecr.io/dbops:prod` |
| Command override | (blank — image defaults to `bash`) |
| Arguments override | (blank — image defaults to `bootstrap.sh`) |
| Identity | **User assigned**: attach `id-arcforge-pg-admin` |

Environment variables:

| Name | Value |
|---|---|
| `PG_HOST` | `arcforge-psql-prd.postgres.database.azure.com` |
| `PG_ADMIN_NAME` | `id-arcforge-pg-admin` (the display name of the managed identity, exactly as it was registered as the Entra admin on the Postgres server) |
| `AZURE_CLIENT_ID` | (the client ID of `id-arcforge-pg-admin`) |

After creation, **Run** the job, then check **Execution history** → console
logs.

## Why Entra auth and not a password

The Postgres server is configured for "Microsoft Entra authentication only"
mode, which disables SQL password authentication entirely. There are no
long-lived passwords to leak, rotate, or store in Key Vault. Each connection
uses a short-lived token (~24h) fetched at runtime from IMDS, scoped to the
attached managed identity.
