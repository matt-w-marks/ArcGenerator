# Azure Deployment + Cloudflare OTP — Planning Checklist

This is the **pre-flight planning doc** for the staging deployment. The CLI-style
runbook in [../README.md](../README.md) has copy-paste commands; this doc has the
**information you need to gather and decisions you need to make** before you
start clicking around in the portal.

Goal of this deploy: get `staging.arcgenerator.<your-domain>` live behind
Cloudflare with the full app stack running, then layer Cloudflare Access OTP on
top in a second pass.

---

## Part 0 — Decisions to make first

| Decision | Recommendation | Notes |
|---|---|---|
| Region | `eastus` (or closest to your users) | Container Apps + Postgres Flexible Server must be in the same region for VNet integration |
| Environment name suffix | `staging` (separate RG from future `prod`) | Lets you tear down without touching production later |
| Hostname | `staging.arcgenerator.<your-domain>` | Subdomain on a zone you already own in Cloudflare |
| Postgres tier | Burstable B1ms (1 vCPU, 2 GB) | ~$13/mo. Plenty for staging. Bump to B2s or General Purpose for prod |
| ACR tier | Basic | $5/mo. Enough for a handful of images |
| Container Apps consumption profile | Consumption (scale-to-zero) | Pay only when serving traffic |
| Networking | VNet-integrated Container Apps Environment | Needed for private Postgres + locking down Postgres to the env |
| Cloudflare ingress mode | Origin pull (Container Apps native ingress + IP restrictions) | Simpler than a tunnel; works with the built-in HTTPS cert. Tunnel is fine too if you prefer. |

---

## Part 1 — Information to gather BEFORE you start

Have these on hand in a password manager or scratch file. You'll need them
during portal clicking.

### Identifiers you need to invent

- [ ] **Resource group name**: `rg-arcgen-staging`
- [ ] **ACR name**: `acrarcgenstaging` (must be globally unique, lowercase, alphanumeric only)
- [ ] **Key Vault name**: `kv-arcgen-staging` (globally unique, 3–24 chars)
- [ ] **Container Apps Environment name**: `cae-arcgen-staging`
- [ ] **Managed Identity name**: `id-arcgen-staging`
- [ ] **VNet name**: `vnet-arcgen-staging`
- [ ] **Postgres server name**: `psql-arcgen-staging` (globally unique)
- [ ] **Log Analytics workspace name**: `log-arcgen-staging`

### Secrets you need to generate

Generate now, paste into Key Vault later. Use a password manager to hold these.

- [ ] **JWT_SECRET** — `openssl rand -base64 64`
- [ ] **JWT_REFRESH_SECRET** — `openssl rand -base64 64`
- [ ] **Postgres admin password** — strong random, 24+ chars
- [ ] **Initial admin user password** — what you'll use to log in via the fallback `/login` page (this is the seeded admin in `arcgenerator_auth.users`)

### Info you need to look up

- [ ] **Azure subscription ID**: `az account show --query id -o tsv`
- [ ] **Cloudflare zone ID** (the domain you're putting `staging.` under): Cloudflare dashboard → your domain → Overview → API section
- [ ] **Cloudflare team domain**: Zero Trust dashboard → Settings → Custom Pages → look for `<yourteam>.cloudflareaccess.com`
- [ ] **Your admin email** for the seeded user (the email Cloudflare will OTP)

---

## Part 2 — Resource inventory

What gets created, in what order, and what depends on what.

### Layer 1 — Foundation (no dependencies)

| # | Resource | Type | Purpose |
|---|---|---|---|
| 1 | Resource group `rg-arcgen-staging` | `Microsoft.Resources/resourceGroups` | Container for everything |
| 2 | Managed identity `id-arcgen-staging` | `Microsoft.ManagedIdentity/userAssignedIdentities` | Used by Container Apps to pull from ACR and read Key Vault |
| 3 | Log Analytics workspace `log-arcgen-staging` | `Microsoft.OperationalInsights/workspaces` | Required by Container Apps Environment for logs |

### Layer 2 — Network

| # | Resource | Type | Purpose |
|---|---|---|---|
| 4 | VNet `vnet-arcgen-staging` (10.10.0.0/16) | `Microsoft.Network/virtualNetworks` | Network boundary |
| 5 | Subnet `snet-containerapps` (10.10.0.0/23) | inside VNet | Container Apps Environment subnet (must be /23 minimum, delegated to `Microsoft.App/environments`) |
| 6 | Subnet `snet-postgres` (10.10.2.0/24) | inside VNet | Delegated to `Microsoft.DBforPostgreSQL/flexibleServers` |
| 7 | Private DNS zone `privatelink.postgres.database.azure.com` | `Microsoft.Network/privateDnsZones` | Resolves the private Postgres FQDN inside the VNet |
| 8 | DNS link from zone → VNet | `virtualNetworkLinks` | Wires the private DNS zone to the VNet |

### Layer 3 — Storage / data

| # | Resource | Type | Purpose |
|---|---|---|---|
| 9 | Postgres Flexible Server `psql-arcgen-staging` | `Microsoft.DBforPostgreSQL/flexibleServers` | The database. VNet-integrated into `snet-postgres`. Burstable B1ms, Postgres 16 |
| 10 | Postgres database `arcgenerator` | inside server | Metrics service data |
| 11 | Postgres database `arcgenerator_auth` | inside server | Auth service data (users, refresh_tokens, login_attempts, password_history, invites) |
| 12 | Postgres database `factory_logs` | inside server | Audit log writes from all services |
| 13 | ACR `acrarcgenstaging` | `Microsoft.ContainerRegistry/registries` | Holds the 5 service images |
| 14 | Key Vault `kv-arcgen-staging` | `Microsoft.KeyVault/vaults` | Holds JWT secrets, DB connection strings, admin password, CF AUD tag |

### Layer 4 — Compute

| # | Resource | Type | Purpose |
|---|---|---|---|
| 15 | Container Apps Environment `cae-arcgen-staging` | `Microsoft.App/managedEnvironments` | The shared host. VNet-integrated into `snet-containerapps`. Linked to Log Analytics workspace. Internal load balancer = NO (public ingress) |
| 16 | Container App `ca-arcgen-auth` | internal ingress, port 3001 | Auth service |
| 17 | Container App `ca-arcgen-metrics` | internal ingress, port 8000 | Metrics service |
| 18 | Container App `ca-arcgen-export` | internal ingress, port 8001 | Export service |
| 19 | Container App `ca-arcgen-gateway` | **external ingress**, port 3000 | Public entry. IP restrictions: Cloudflare ranges only |
| 20 | Container App `ca-arcgen-frontend` | **external ingress**, port 80 | Public static. IP restrictions: Cloudflare ranges only |

### Layer 5 — Role assignments (RBAC wiring)

| # | Assignment | Scope | Why |
|---|---|---|---|
| 21 | `id-arcgen-staging` → **AcrPull** | ACR | So Container Apps can pull images |
| 22 | `id-arcgen-staging` → **Key Vault Secrets User** | Key Vault | So Container Apps can read secrets at startup |

### Layer 6 — DNS (Cloudflare side, not Azure)

| # | Resource | Where | Purpose |
|---|---|---|---|
| 23 | CNAME `staging.arcgenerator.<domain>` → `ca-arcgen-frontend.<env>.<region>.azurecontainerapps.io` | Cloudflare DNS | Frontend hostname |
| 24 | CNAME `api-staging.arcgenerator.<domain>` → `ca-arcgen-gateway.<env>.<region>.azurecontainerapps.io` | Cloudflare DNS | (Optional) gateway hostname if you want a separate API host. Otherwise the frontend nginx proxies to the gateway internally |

> **Choice**: Single hostname (frontend nginx reverse-proxies `/auth/*`, `/metrics/*`, `/export/*` to the gateway over the Container Apps internal network) **or** two hostnames (frontend + api). Single is simpler and matches the `nginx.conf` you already have once you add the proxy_pass blocks. Two is more conventional.

---

## Part 3 — Environment variable matrix

What env vars each Container App needs. **Bold = secret, store in Key Vault and reference via secret reference.**

### `ca-arcgen-auth`

| Var | Source | Example value |
|---|---|---|
| `PORT` | literal | `3001` |
| **`DATABASE_URL`** | Key Vault `auth-database-url` | `postgresql://arcgen:<pw>@psql-arcgen-staging.postgres.database.azure.com/arcgenerator_auth?sslmode=require` |
| **`LOGGING_DATABASE_URL`** | Key Vault `logging-database-url` | `postgresql://arcgen:<pw>@psql-arcgen-staging.postgres.database.azure.com/factory_logs?sslmode=require` |
| **`JWT_SECRET`** | Key Vault `jwt-secret` | (random 64 bytes b64) |
| **`JWT_REFRESH_SECRET`** | Key Vault `jwt-refresh-secret` | (random 64 bytes b64) |
| **`ADMIN_EMAIL`** | Key Vault `admin-email` | `you@yourdomain.com` |
| **`ADMIN_PASSWORD`** | Key Vault `admin-password` | (your fallback login password) |
| `CF_ACCESS_TEAM_DOMAIN` | **leave unset in Phase 1** | `<yourteam>.cloudflareaccess.com` (set in Phase 2) |
| `CF_ACCESS_AUD` | **leave unset in Phase 1** | (AUD tag from CF Access app, set in Phase 2) |

### `ca-arcgen-metrics`

| Var | Source | Example value |
|---|---|---|
| **`DATABASE_URL`** | Key Vault `metrics-database-url` | `postgresql+psycopg://arcgen:<pw>@psql-arcgen-staging.postgres.database.azure.com/arcgenerator?sslmode=require` |
| **`LOGGING_DATABASE_URL`** | Key Vault `logging-database-url` | (same as above, factory_logs DB) |

### `ca-arcgen-export`

Same two env vars as metrics — uses the same `arcgenerator` and `factory_logs` databases.

### `ca-arcgen-gateway`

| Var | Source | Example value |
|---|---|---|
| `PORT` | literal | `3000` |
| `AUTH_SERVICE_URL` | literal | `http://ca-arcgen-auth` (internal Container Apps DNS) |
| `METRICS_SERVICE_URL` | literal | `http://ca-arcgen-metrics` |
| `EXPORT_SERVICE_URL` | literal | `http://ca-arcgen-export` |
| **`JWT_SECRET`** | Key Vault `jwt-secret` | (same as auth) |

### `ca-arcgen-frontend`

No env vars. Static nginx serving the Vite build. (If you go single-hostname, you'll
add `proxy_pass` blocks to `nginx.conf` pointing at the gateway's internal URL,
then rebuild the image.)

---

## Part 4 — Step order (what to do in what sequence)

1. **Foundation**: RG → managed identity → Log Analytics workspace
2. **Network**: VNet → 2 subnets → private DNS zone → VNet link
3. **Postgres**: Flexible Server (VNet-integrated into `snet-postgres`) → wait for provisioning → connect with `psql` and run:
   ```sql
   CREATE DATABASE arcgenerator;
   CREATE DATABASE arcgenerator_auth;
   CREATE DATABASE factory_logs;
   CREATE USER arcgen WITH PASSWORD '<from-keyvault>';
   GRANT ALL PRIVILEGES ON DATABASE arcgenerator     TO arcgen;
   GRANT ALL PRIVILEGES ON DATABASE arcgenerator_auth TO arcgen;
   GRANT ALL PRIVILEGES ON DATABASE factory_logs     TO arcgen;
   ```
   *(Migrations run automatically on first auth/metrics startup — Sequelize for auth, Alembic for metrics. Don't pre-create tables.)*
4. **ACR**: create → assign AcrPull to managed identity
5. **Key Vault**: create → assign Secrets User to managed identity → upload all secrets from your password manager
6. **Build & push images** to ACR: gateway, auth, metrics, export, frontend (5 builds). Use `az acr build` from the existing runbook or `docker push` after `az acr login`
7. **Container Apps Environment**: create, VNet-integrated, linked to Log Analytics
8. **Container Apps**: deploy in this order (so internal services exist when gateway boots):
   - auth (wait for healthy → check logs for "migrations complete")
   - metrics (wait for healthy → check logs for Alembic output)
   - export
   - gateway (with IP restrictions = Cloudflare IPs, see Part 5)
   - frontend (with IP restrictions = Cloudflare IPs)
9. **Cloudflare DNS**: create CNAME(s), proxy enabled (orange cloud)
10. **Smoke test** through Cloudflare:
    - `curl https://staging.arcgenerator.<domain>/health` → JSON ok
    - Visit in browser → app loads → log in with seeded admin → poke around
    - Confirm `factory_logs` table has rows

**At this point Phase 1 of the cutover plan is complete.** Cloudflare is just a
proxy — no Access app yet. Password login works.

---

## Part 5 — Cloudflare IP restrictions on Container Apps ingress

Container Apps has a built-in ingress IP restriction feature (no NSG needed).

1. Get Cloudflare's IPv4 + IPv6 ranges from <https://www.cloudflare.com/ips/>
2. On `ca-arcgen-gateway`: Settings → Ingress → IP Security Restrictions → Allow → paste each CIDR
3. Same on `ca-arcgen-frontend`
4. **Test from outside Cloudflare**: `curl https://ca-arcgen-frontend.<env>.<region>.azurecontainerapps.io/` → should return `403 Forbidden`. From your browser through Cloudflare → 200.

> **Important**: this list of IPs changes occasionally. Cloudflare publishes updates
> via their [IP ranges page](https://www.cloudflare.com/ips/). Set a calendar reminder
> to refresh quarterly, or automate via a small script that diffs against the live list.

---

## Part 6 — Cloudflare Access OTP setup (Phase 2)

Done after Phase 1 staging is verified working with password login.

### Step-by-step in the Cloudflare dashboard

1. **Zero Trust dashboard** → Access → Applications → Add an application → Self-hosted
2. **Application configuration**:
   - Name: `ArcGenerator Staging`
   - Session duration: 24 hours (or whatever feels right for your users)
   - Application domain: `staging.arcgenerator.<your-domain>`
   - Path: leave blank (whole host)
3. **Identity providers**:
   - Add → One-time PIN
   - This is the email OTP IdP. No external IdP needed.
4. **Policies** → Add a policy:
   - Action: Allow
   - Configure rules → Include → Emails → list your initial allowlist (you, your spouse, friends/family)
   - Optionally: Selector "Email domain ends with" if you want to whitelist a whole domain
5. **Bypass policy** (second policy on the same app):
   - Action: Bypass
   - Path: `/auth/invites/*`
   - This keeps the legacy invite endpoint reachable as an emergency fallback
6. **Save**. Cloudflare now intercepts every request to that hostname.
7. **Note the AUD tag** — back on the application's settings page, scroll to "Application Audience (AUD) Tag". Copy it. It's a long hex string.
8. **Store the AUD tag in Key Vault**:
   - Key Vault → Secrets → Generate → Name: `cf-access-aud`, Value: (paste tag)
9. **Add env vars to `ca-arcgen-auth`**:
   - `CF_ACCESS_TEAM_DOMAIN` = literal `<yourteam>.cloudflareaccess.com`
   - `CF_ACCESS_AUD` = secret reference to `cf-access-aud`
   - Save → Container App creates a new revision and restarts auth
10. **Provision yourself in the users table** (if not already there from the seeded admin):
    - Visit the staging site → log in via the fallback password page (still works)
    - Settings → Users → Add User → enter your email + role ADMIN
    - The user is created with `password_hash = NULL` — Cloudflare OTP will be the only sign-in path
11. **Test in incognito**:
    - Visit `staging.arcgenerator.<domain>`
    - Cloudflare OTP screen appears → enter your email → check inbox → enter 6-digit code
    - Land on the dashboard already logged in. No password prompt.
    - Check `factory_logs` for `'sso login successful'` event

### Cloudflare-side things to watch out for

- **Test domain first** — never enable Access on the production hostname before staging is fully validated. Once Access is on, anyone hitting that hostname is gated.
- **AUD tag is per-application** — if you create a second Access app for production, it gets a different AUD. Two env vars, two configs.
- **Email delivery** — first OTP test in incognito, the email may take 30 seconds to arrive. If it doesn't, check Cloudflare's "Logs" tab in Zero Trust → Logs → Access for the auth attempt.
- **Free tier ceiling**: 50 users on the policy. Plenty for friends and family.

---

## Part 7 — Verification matrix (Phase 1 + Phase 2 combined)

| Test | Expected result |
|---|---|
| `curl https://ca-arcgen-frontend.<env>.<region>.azurecontainerapps.io/` (direct, no CF) | 403 Forbidden (IP restriction) |
| `curl https://staging.arcgenerator.<domain>/health` (through CF, before Access enabled) | 200 OK JSON |
| Browser → staging hostname → after Access enabled | CF OTP screen |
| Email OTP → enter code | Land on dashboard, already logged in |
| Settings → Profile (for SSO user) | Shows "Set Password" instead of "Change Password" |
| Sign out → visit `/login` directly through CF | Password fallback form, works with admin password |
| Add a CF-allowed email that's not in `users` table | OTP works, then app shows 403 → fallback login page |
| Curl gateway with `Cf-Access-Jwt-Assertion: bogus` through CF | 401 from JWT verify middleware |
| `factory_logs` table | Rows for `'sso login successful'`, `'login successful'`, etc. |

---

## Part 8 — Cost estimate (staging, monthly)

Rough numbers, not an SLA:

| Resource | Approximate cost |
|---|---|
| Postgres Flexible Server B1ms + 32 GB storage | ~$15 |
| ACR Basic | ~$5 |
| Container Apps (5 apps, scale-to-zero, light traffic) | ~$5–15 |
| Log Analytics (small ingestion) | ~$2–5 |
| Key Vault | <$1 |
| Public IP / bandwidth | <$1 |
| **Total** | **~$30–45/mo** |

Cloudflare Access free tier covers up to 50 users → **$0**.

---

## Open questions before you start

- [ ] Single hostname or two? (Affects Cloudflare DNS + nginx config)
- [ ] Are you OK with the seeded admin being created from Key Vault env vars on first boot, or do you want to insert it manually via psql after migration?
- [ ] Do you want to set up GitHub Actions for CI/CD now, or just `az acr build` manually for staging?
- [ ] What's the SLA you want for Postgres? B1ms is fine for staging but production should probably be General Purpose with HA or at least PITR backups configured
