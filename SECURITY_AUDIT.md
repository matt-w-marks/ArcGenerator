# RoadMap Dashboard — Security Audit Report

**Phase**: 8
**Date**: 2026-04-01
**Standard**: OWASP Top 10:2025 (A01–A10)
**Status**: PASSED — all findings remediated

---

## Dependency Audit Results

| Tool | Target | Result |
|------|--------|--------|
| `npm audit` | `gateway/` | 0 vulnerabilities |
| `npm audit` | `frontend/` | 0 vulnerabilities |
| `pip-audit` | `services/metrics/` | 0 vulnerabilities |
| `pip-audit` | `services/export/` | 0 vulnerabilities |

### CVEs Remediated

| CVE | Severity | Package | Fixed version | Service |
|-----|----------|---------|---------------|---------|
| CVE-2024-47874 | High | `starlette 0.37.2` (via fastapi 0.111.0) | `fastapi==0.128.0` → starlette 0.50.0 | metrics, export |
| CVE-2025-54121 | High | `starlette 0.37.2` (via fastapi 0.111.0) | `fastapi==0.128.0` → starlette 0.50.0 | metrics, export |
| GHSA-2w69-qvjg-hvjx | High | `react-router-dom 6.28.0` | `6.30.3` | frontend |
| GHSA-5c6j-r48x-rmvq | High | `serialize-javascript ≤7.0.4` (via workbox-build) | override `7.0.5` | frontend |
| GHSA-qj8w-gfj5-8c6v | High | `serialize-javascript ≤7.0.4` (via workbox-build) | override `7.0.5` | frontend |

---

## OWASP Top 10:2025 Review

### A01: Broken Access Control — PASS

| Control | Implementation | Location |
|---------|---------------|----------|
| JWT required on protected routes | `authenticate` middleware on `/metrics`, `/export` | `gateway/src/middleware/authenticate.js` |
| Client identity headers stripped | `delete req.headers['x-user-id']` before any proxy | `gateway/src/app.js:17-22` |
| Verified identity headers injected | `injectUserHeaders` after JWT verification only | `gateway/src/app.js:49-54` |
| Export service checks x-user-id | `_require_user` dependency rejects missing header | `services/export/routers/exports.py` |
| Admin-only seeded user | No self-registration endpoint | `services/auth/src/db/seed.js` |
| Deny by default | All routes 401 unless explicitly authenticated | All services |

**Adversarial tests**: header spoofing attempts (x-user-id, x-user-role), direct access without JWT, header injection on authenticated routes — all rejected correctly.

---

### A02: Security Misconfiguration — PASS

| Control | Implementation |
|---------|---------------|
| Security headers | `helmet()` on both gateway and auth service |
| Body size limit | 1MB cap via `express.json({ limit: '1mb' })` on gateway |
| No verbose errors | All error handlers return generic messages only |
| No default credentials | Admin password seeded from `ADMIN_PASSWORD` env var |
| Swagger UI disabled | `docs_url=None, redoc_url=None` in Python services |

**Finding and fix**: gateway error handler always returned 500, masking Express's own 413 `PayloadTooLargeError`. Fixed to preserve well-known HTTP status codes while still returning a generic message body.

---

### A03: Software Supply Chain Failures — PASS

| Control | Implementation |
|---------|---------------|
| All deps pinned exactly | No `^`, `~`, or `>=` ranges — exact versions only |
| Dependency vetting | Blueprint checklist run before every install (Phases 0–7) |
| CODEOWNERS | Requires owner review on all `package.json`, `requirements.txt`, `Dockerfile*` |
| CI pipeline | `npm audit` + `pip-audit` in `security.yml` |
| Lock files committed | `package-lock.json` committed for all Node services |

---

### A04: Cryptographic Failures — PASS

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt, 12 rounds (`SALT_ROUNDS = 12`) |
| Refresh token storage | SHA-256 hash stored in DB (never raw token) |
| Access token expiry | 15 minutes (`ACCESS_TOKEN_EXPIRY = '15m'`) |
| Refresh token expiry | 7 days, server-side revocation on use |
| No plaintext secrets | All secrets from env vars; `.env` blocked by `.gitignore` |
| JWT algorithm | HS256 (default) — algorithm confusion tests pass |

**Adversarial tests**: `alg:none` attack, wrong-secret forgery, tampered payload — all return 401.

---

### A05: Injection — PASS

| Control | Implementation |
|---------|---------------|
| No raw SQL | SQLAlchemy ORM exclusively (Python); Sequelize ORM (Node) |
| factory_log writes | SQLAlchemy `insert()` expression with bound parameters; `pg` with `$1..$N` parameterized queries |
| Input passed to ORM | User-supplied values flow through ORM parameter binding only |
| Bandit SAST | Pre-commit hook catches injection patterns |

**Adversarial tests**: SQL OR injection (`' OR '1'='1`), semicolon injection, null byte in email — all return 401/400, never 500.

---

### A06: Insecure Design — PASS

| Control | Implementation |
|---------|---------------|
| Auth service rate limit | 20 req / 15 min per IP on all `/auth` routes |
| Gateway global rate limit | 200 req / 15 min per IP |
| Account lockout | 5 failed attempts → 15-minute lockout |
| Lockout bypass prevention | Lockout checked before password comparison |
| Refresh token rotation | Old token revoked immediately on use |
| Body size enforcement | 1MB limit verified with adversarial test (413 confirmed) |

---

### A07: Authentication Failures — PASS

| Control | Implementation |
|---------|---------------|
| No weak password policy gap | No self-registration — admin password set via env var |
| Short-lived access tokens | 15-minute expiry |
| Server-side token revocation | Refresh tokens stored in DB with `revoked_at` |
| Lockout after failures | 5 attempts → 15-minute lockout |
| Replay attack prevention | Refresh token immediately revoked on use |

**Adversarial tests**: revoked token re-use, expired token, locked account bypass attempt — all rejected.

---

### A08: Software or Data Integrity Failures — PASS

| Control | Implementation |
|---------|---------------|
| CODEOWNERS | CI/CD workflows, Dockerfiles, CLAUDE.md, auth/security middleware |
| Pre-commit hooks | gitleaks, detect-private-key, check-json, check-yaml |
| Pinned dep versions | No floating ranges — integrity verifiable by hash |
| CodeQL in CI | Python + JS/TS SAST |

---

### A09: Security Logging and Alerting Failures — PASS (after remediation)

**Finding**: Auth service was missing `factory_logs.flg_entries` writes. Metrics and export services both wrote to factory_logs; auth did not.

**Remediation**: Added `services/auth/src/services/factoryLog.js` using the existing `pg` dep with parameterized queries. Auth now logs:
- `WARN` — login failed (user not found)
- `WARN` — login rejected (account locked)
- `WARN` — login failed (wrong password)
- `WARN` — account locked after repeated failures
- `INFO` — login successful
- `INFO` — token refreshed
- `WARN` — token refresh failed (user not found)

| Service | Logs to factory_logs | app_label |
|---------|---------------------|-----------|
| auth | ✓ (remediated Phase 8) | `auth` |
| metrics | ✓ (Phase 4) | `metrics` |
| export | ✓ (Phase 7) | `export` |
| gateway | Logging delegated to downstream services | — |

---

### A10: Mishandling of Exceptional Conditions — PASS

| Control | Implementation |
|---------|---------------|
| No stack traces in responses | All error handlers return `{ error: 'Internal server error' }` only |
| Specific HTTP status codes | 400/401/403/413 where appropriate; 500 for unexpected errors |
| DB errors suppressed in factory_log | All logging wrapped in try/catch with silent failure |

**Adversarial tests**: DB connection errors during login/refresh → 500 with no stack trace, no internal message.

---

## Adversarial Test Summary

| Suite | Tests | Covers |
|-------|-------|--------|
| `services/auth/tests/security/adversarial.test.js` | 15 | A01, A05, A07, A10 |
| `gateway/tests/security/adversarial.test.js` | 14 | A01, A02, A04, A06, A07 |

**Total adversarial tests added**: 29

---

## Test Coverage After Phase 8

| Service | Total Tests | Coverage |
|---------|-------------|----------|
| Auth service | 54 (39 existing + 15 adversarial) | 100% authService.js |
| Gateway | 38 (24 existing + 14 adversarial) | 100% authenticate.js |
| Metrics service | 89 | 96% overall |
| Export service | 12 | 93% overall |

---

## Sign-Off

All OWASP Top 10:2025 controls reviewed and verified.
All CVEs identified by `npm audit` and `pip-audit` remediated.
All adversarial test cases pass.
Ready for Phase 9 (Azure Prep).
