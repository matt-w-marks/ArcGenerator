# RoadMap Dashboard

A Progressive Web App (PWA) for tracking rideshare driving metrics, job search activity, and financial progress. Installable on Android.

## Factory Position

| Attribute | Value |
|-----------|-------|
| System | RoadMap Dashboard |
| Repo | ArcGenerator |
| Factory Role | Consumer |
| Stages Touched | ArcForgeFabricator (output) |
| Role Type | Consumer — standalone product built using factory standards |

## Architecture

Microservices with Domain-Driven Design:

| Service | Language | Port | Purpose |
|---------|----------|------|---------|
| API Gateway | Node.js / Express | 3000 | Routing, JWT validation, rate limiting, security headers |
| Auth Service | Node.js / Express | 3001 | JWT access + refresh tokens, ADMIN role, account lockout |
| Metrics Service | Python / FastAPI | 8000 | CRUD for all 4 domain entities via SQLAlchemy ORM |
| Export Service | Python | 8001 | CSV export for all domain entities |
| Frontend PWA | React / Vite | 5173 | Dashboard UI with Arc theme, installable PWA |
| PostgreSQL | — | 5432 | App DB (roadmap schema) + factory_logs schema |

## Domain Model

- `DrivingSession` — daily rideshare entry (hours, earnings, gas, trips, zones)
- `JobActivity` — daily job search tracking (applications, LinkedIn, recruiter contacts)
- `FinancialSnapshot` — daily computed summary (bankroll, runway, tax accrual)
- `WeeklyRollup` — auto-computed Sunday rollup of weekly totals

All primary keys are UUIDs. ORM-only database access (SQLAlchemy). Zero raw SQL.

## Non-Negotiable Constraints

- OWASP Top 10:2025 compliance (A01–A10)
- SQLAlchemy ORM exclusively — zero raw SQL
- No stack traces in HTTP responses
- No secrets in code — secrets via environment variables only
- JWT refresh tokens stored server-side
- All services run as non-root
- ADMIN role seeded only — no self-registration
- UUID primary keys only
- All dependency versions pinned exactly (no `^`, `~`, `>=`)
- Every new dependency vetted per PRINCIPLES.md checklist before install
- 80% overall test coverage minimum; 100% for auth/validation logic

## Factory Logging

All services write operational events to the shared `factory_logs` schema:
- Table: `factory_logs.flg_entries`
- Connection: `LOGGING_DATABASE_URL` environment variable
- App label: `roadmap`

## UI Theme

Arc theme ported from ArcForge design system:
- Obsidian base: `#0A0E14` | Arc cyan: `#00D4FF` | Ember gold: `#FFB020` | Neural purple: `#8B5CF6`
- Tailwind CSS 4, shadcn/ui (New York style), Lucide React
- Fixed 240px sidebar (desktop) + mobile drawer, matching ArcForge nav structure

## Build Phases

| Phase | Description |
|-------|-------------|
| 0 | Repo & governance (this phase) |
| 1 | Infrastructure (monorepo, docker-compose) |
| 2 | Database & ORM (SQLAlchemy models, Alembic migrations) |
| 3 | Auth Service |
| 4 | Metrics Service |
| 5 | API Gateway |
| 6 | Frontend PWA |
| 7 | Export Service |
| 8 | Security Audit |
| 9 | Azure Prep (manifests only) |

## References

- Spec: `DRIVER_METRICS_APP_SPEC.md`
- Blueprint: `D:\Projects\ArcPlatform-BluePrint\`
- Engineering principles: `D:\Projects\ArcPlatform-BluePrint\PRINCIPLES.md`
- Factory stages: `D:\Projects\ArcPlatform-BluePrint\FACTORY.md`
