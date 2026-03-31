# Driver Metrics App — Claude Code Build Spec
## Project: RoadMap Dashboard
### Version: 1.0 — MVP
### Owner: Matt Marks | matt.marks@arcforge.ai
### Date: March 2026

---

## 1. Project Overview

A Progressive Web App (PWA) that tracks daily rideshare driving metrics, job search activity, and financial progress. Admin enters data daily (or hourly during testing). All other authenticated users see read-only dashboards. Showcases real-time progress to friends and accountability partners.

**Core thesis:** One person inputs. Many people watch. The data tells the story of the rebuild.

---

## 2. Architecture Overview

### Pattern: Microservices — Domain Driven Design
### Deployment: Azure Container Apps (production) / Docker Compose (dev + test)
### Security: OWASP Top 10 (2021) compliance required across all services

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│         PWA (React + Vite) — installable on Android      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS only
┌──────────────────────▼──────────────────────────────────┐
│                   API GATEWAY                            │
│         Node.js / Express — Auth + Rate Limiting         │
│         JWT validation — Role enforcement (ADMIN/VIEWER) │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────┐
│   METRICS   │ │    AUTH    │ │   EXPORT    │
│   SERVICE   │ │   SERVICE  │ │   SERVICE   │
│  (Python/   │ │ (Node.js)  │ │  (Python)   │
│  FastAPI)   │ │            │ │             │
└──────┬──────┘ └─────┬──────┘ └────┬────────┘
       │              │              │
┌──────▼──────────────▼──────────────▼────────┐
│              PostgreSQL (single DB)          │
│         SQLAlchemy ORM — no raw SQL          │
│         Domain models only — no fallbacks    │
└──────────────────────────────────────────────┘
```

---

## 3. Services Breakdown

### 3.1 API Gateway (Node.js / Express)
- JWT authentication middleware on all routes
- Role-based access control: ADMIN vs VIEWER
- Rate limiting per IP (OWASP A05)
- Request validation and sanitization (OWASP A03)
- HTTPS enforcement — redirect all HTTP
- Security headers: Helmet.js (CSP, HSTS, X-Frame-Options, etc.)
- CORS locked to known origins only
- No stack traces in error responses (OWASP A09)

### 3.2 Auth Service (Node.js)
- JWT issuance and refresh token rotation
- Bcrypt password hashing (min rounds: 12)
- ADMIN role: hardcoded single user (Matt) — no self-registration
- VIEWER role: invite-only or open registration (dashboard read-only)
- Refresh tokens stored server-side (Redis or DB) — not client-only
- Token blacklist on logout
- Account lockout after 5 failed attempts (OWASP A07)
- Secure httpOnly cookie for refresh token
- CSRF protection on all state-changing endpoints

### 3.3 Metrics Service (Python / FastAPI)
- All database interactions via SQLAlchemy ORM exclusively
- No raw SQL anywhere — no exceptions — no fallbacks
- Input validation via Pydantic models
- Domain entities: DrivingSession, JobActivity, FinancialSummary, WeeklyRollup
- CRUD endpoints for ADMIN only
- Read endpoints for all authenticated users
- Parameterized queries enforced by ORM (OWASP A03)

### 3.4 Export Service (Python)
- CSV export of metrics data
- Future: PDF weekly summary report
- ADMIN only
- Rate limited separately

---

## 4. Domain Model — Metrics

### 4.1 DrivingSession (daily entry — primary input unit)
```
id                  UUID primary key
date                Date (required)
shift_start         Time
shift_end           Time
hours_driven        Decimal(4,2)
gross_earnings      Decimal(8,2)
rental_cost         Decimal(8,2)    -- weekly rate prorated daily
gas_cost            Decimal(6,2)
trips_completed     Integer
zone_primary        String          -- e.g. "PHX Airport", "Old Town Scottsdale"
zone_secondary      String          -- optional second zone of the day
service_type        Enum            -- RIDES / EATS / BOTH
hourly_rate_gross   Decimal(6,2)    -- computed: gross / hours
hourly_rate_net     Decimal(6,2)    -- computed: (gross - expenses) / hours
notes               Text            -- free field for observations
created_at          Timestamp
updated_at          Timestamp
```

### 4.2 JobActivity (daily entry)
```
id                  UUID primary key
date                Date (required)
applications_sent   Integer
linkedin_posts      Integer
linkedin_comments   Integer
recruiter_contacts  Integer
interviews_scheduled Integer
follow_ups_sent     Integer
notes               Text
created_at          Timestamp
updated_at          Timestamp
```

### 4.3 FinancialSnapshot (daily computed summary)
```
id                  UUID primary key
date                Date (required)
bankroll_remaining  Decimal(10,2)   -- manual input: $11k minus burns
weekly_gross        Decimal(10,2)   -- computed from sessions
weekly_net          Decimal(10,2)   -- computed from sessions
monthly_gross_proj  Decimal(10,2)   -- weekly × 4.3
monthly_net_proj    Decimal(10,2)
runway_days         Integer         -- bankroll / daily burn
se_tax_accrued      Decimal(8,2)    -- 15% of gross accumulated
created_at          Timestamp
updated_at          Timestamp
```

### 4.4 WeeklyRollup (auto-computed Sunday)
```
id                  UUID primary key
week_start          Date
week_end            Date
total_hours         Decimal(6,2)
total_gross         Decimal(10,2)
total_net           Decimal(10,2)
total_trips         Integer
avg_hourly_gross    Decimal(6,2)
avg_hourly_net      Decimal(6,2)
rental_cost_week    Decimal(8,2)
gas_cost_week       Decimal(8,2)
job_applications    Integer
recruiter_contacts  Integer
linkedin_activity   Integer
trips_min_met       Boolean         -- 30 trip minimum hit?
phase               Enum            -- PHASE_1 / PHASE_2 / PHASE_3
created_at          Timestamp
```

---

## 5. Dashboard Views

### 5.1 Admin Dashboard (ADMIN role only)
- Data entry forms for DrivingSession, JobActivity, FinancialSnapshot
- Full CRUD on all entries
- Raw data table with edit/delete
- Export button (CSV)
- All viewer dashboard content also visible

### 5.2 Public Dashboard (VIEWER role — default for all)
All read-only. No editing. No raw data.

**Hero metrics strip (top of page):**
- Today's gross earnings
- Today's hours driven
- Today's trips
- Current weekly trip count vs 30 minimum
- Current hourly rate (gross)
- Bankroll remaining + runway days

**Driving performance card:**
- This week vs last week comparison
- Weekly gross / net / hours bar chart (Chart.js)
- Hourly rate trend line — last 7 days
- Zone performance breakdown (which zones earning most)
- Cumulative trips to date

**Job search card:**
- Applications this week
- Total applications to date
- Recruiter contacts this week
- LinkedIn activity streak (consecutive days active)
- Interviews scheduled

**Financial card:**
- Monthly gross projection
- Monthly net projection vs $3,500 nut
- SE tax accrued (show the real picture)
- Bankroll burn rate chart
- Phase indicator (Phase 1 / 2 / 3)

**Daily log feed:**
- Last 7 days of sessions — date, zone, hours, gross, trips
- Clean card-based timeline

---

## 6. PWA Requirements

- manifest.json with app name, icons, theme color
- Service worker for offline support (read cached data when offline)
- Installable on Android home screen
- Responsive — mobile first, tablet and desktop secondary
- Fast — Lighthouse PWA score target 90+
- Push notifications (future) — daily entry reminder at 9 PM

---

## 7. Security Requirements — OWASP Top 10 (2021)

| # | Risk | Implementation |
|---|------|----------------|
| A01 | Broken Access Control | ADMIN/VIEWER roles enforced at gateway and service level. No IDOR — UUIDs only. |
| A02 | Cryptographic Failures | HTTPS only. Bcrypt pw hashing. JWT signed HS256 minimum. No sensitive data in logs. |
| A03 | Injection | SQLAlchemy ORM exclusively — no raw SQL. Pydantic input validation. Parameterized everything. |
| A04 | Insecure Design | DDD domain boundaries. Input validation before persistence. Principle of least privilege on all roles. |
| A05 | Security Misconfiguration | Helmet.js headers. CORS locked. No default credentials. No debug mode in prod. Secrets via env vars only. |
| A06 | Vulnerable Components | npm audit and pip audit in CI pipeline. Dependabot alerts enabled. |
| A07 | Auth Failures | Account lockout at 5 attempts. Refresh token rotation. Secure httpOnly cookies. No JWT in localStorage. |
| A08 | Data Integrity | Signed JWTs. Input validation on all write endpoints. No untrusted deserialization. |
| A09 | Logging Failures | Structured logging all services. No PII or secrets in logs. Log all auth events. Centralized log aggregation. |
| A10 | SSRF | No external URL fetching from backend. All external calls whitelisted. |

---

## 8. Docker Compose — Dev / Test Environment

```yaml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: roadmap_db
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api-gateway:
    build: ./services/gateway
    ports:
      - "3000:3000"
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - METRICS_SERVICE_URL=http://metrics:8000
      - AUTH_SERVICE_URL=http://auth:3001
    depends_on:
      - postgres
      - metrics
      - auth

  auth:
    build: ./services/auth
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

  metrics:
    build: ./services/metrics
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}

  export:
    build: ./services/export
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=${DATABASE_URL}

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3000

volumes:
  postgres_data:
```

---

## 9. Azure Container Apps — Production Topology

- One Container App per service (gateway, auth, metrics, export, frontend)
- Azure Container Registry for image storage
- Azure Database for PostgreSQL — Flexible Server
- Azure Key Vault for all secrets (no env vars hardcoded in prod)
- HTTPS enforced via Container Apps ingress
- Managed Identity for service-to-database auth
- Container Apps Environment with internal networking between services
- Frontend Container App with external ingress only
- All other services internal ingress only (not publicly exposed)

---

## 10. Project Structure

```
roadmap/
├── docker-compose.yml
├── docker-compose.test.yml
├── .env.example
├── .gitignore
├── README.md
│
├── services/
│   ├── gateway/              # Node.js / Express
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.js
│   │   │   │   ├── rateLimit.js
│   │   │   │   └── security.js
│   │   │   ├── routes/
│   │   │   └── app.js
│   │
│   ├── auth/                 # Node.js
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       ├── domain/
│   │       │   └── user.js
│   │       ├── repositories/
│   │       │   └── userRepository.js
│   │       └── routes/
│   │           └── auth.js
│   │
│   ├── metrics/              # Python / FastAPI
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── src/
│   │       ├── domain/
│   │       │   ├── driving_session.py
│   │       │   ├── job_activity.py
│   │       │   ├── financial_snapshot.py
│   │       │   └── weekly_rollup.py
│   │       ├── repositories/
│   │       │   ├── driving_repository.py
│   │       │   ├── job_repository.py
│   │       │   └── financial_repository.py
│   │       ├── schemas/       # Pydantic models
│   │       ├── routes/
│   │       └── main.py
│   │
│   └── export/               # Python
│       ├── Dockerfile
│       ├── requirements.txt
│       └── src/
│
└── frontend/                 # React + Vite PWA
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── public/
    │   ├── manifest.json
    │   └── icons/
    └── src/
        ├── components/
        │   ├── dashboard/
        │   │   ├── HeroMetrics.jsx
        │   │   ├── DrivingCard.jsx
        │   │   ├── JobSearchCard.jsx
        │   │   ├── FinancialCard.jsx
        │   │   └── DailyFeed.jsx
        │   └── admin/
        │       ├── SessionForm.jsx
        │       ├── JobForm.jsx
        │       └── FinancialForm.jsx
        ├── hooks/
        ├── services/          # API calls
        ├── stores/            # State management
        └── App.jsx
```

---

## 11. Build Sequence for Claude Code

Execute in this order. Do not skip phases.

### Phase 1 — Infrastructure
1. Create monorepo structure exactly as shown above
2. Write docker-compose.yml
3. Write .env.example with all required variables
4. Confirm Docker Compose boots clean with postgres healthy

### Phase 2 — Database + ORM
1. SQLAlchemy models for all four domain entities
2. Alembic migrations
3. Seed script with one week of sample data
4. Confirm all models migrate clean

### Phase 3 — Auth Service
1. User model with ADMIN/VIEWER roles
2. Registration (VIEWER open, ADMIN seeded only)
3. Login → JWT access token + refresh token
4. Refresh token rotation endpoint
5. Logout with token blacklist
6. Account lockout after 5 failures
7. All OWASP A07 items confirmed

### Phase 4 — Metrics Service
1. CRUD endpoints for DrivingSession (ADMIN write, all read)
2. CRUD endpoints for JobActivity (ADMIN write, all read)
3. CRUD endpoints for FinancialSnapshot (ADMIN write, all read)
4. Auto-computed WeeklyRollup on POST/PUT of session data
5. All Pydantic validation in place
6. Confirm ORM only — no raw SQL anywhere

### Phase 5 — API Gateway
1. Route all traffic through gateway
2. JWT validation middleware
3. Role enforcement on all routes
4. Rate limiting
5. Helmet.js security headers
6. CORS configuration
7. Error handling — no stack traces exposed

### Phase 6 — Frontend PWA
1. Vite + React scaffold
2. manifest.json + service worker
3. Auth flow — login, token storage (httpOnly cookie), logout
4. Admin dashboard — all four input forms
5. Viewer dashboard — all five card components
6. Chart.js integration for trend charts
7. Mobile-first responsive layout
8. PWA install prompt on Android

### Phase 7 — Export Service
1. CSV export endpoint for all metrics by date range
2. ADMIN only
3. Rate limited

### Phase 8 — Security Audit
1. Run npm audit on all Node services
2. Run pip audit on all Python services
3. Manual OWASP Top 10 review against implementation
4. Confirm no raw SQL anywhere in codebase
5. Confirm no secrets in code — env vars only
6. Confirm all error responses sanitized

### Phase 9 — Azure Prep
1. Dockerfiles production-hardened (non-root user, minimal base image)
2. Azure Container Apps deployment manifests
3. Azure Key Vault integration documented
4. README with full deployment instructions

---

## 12. Key Constraints — Non-Negotiable

- SQLAlchemy ORM only. No raw SQL. No exceptions. No fallbacks.
- No stack traces in any HTTP error response
- No secrets in code or version control
- JWT refresh tokens stored server-side — not client-only
- All services run as non-root in Docker
- ADMIN role seeded — never self-registered
- All write endpoints require ADMIN role
- UUID primary keys on all entities — no sequential integers exposed

---

## 13. Metrics Reference — What We're Tracking

Built from the full Uber strategy session covering:

**Driving:**
- Daily gross earnings, net earnings, hourly rate (gross + net)
- Hours driven per day and per week
- Trips completed (vs 30/week Hertz minimum)
- Gas cost, rental cost (prorated)
- Primary and secondary zones driven
- Service type (Rides / Eats / Both)
- 7-day and 4-week trend lines

**Financial:**
- Bankroll remaining ($11k starting point)
- Runway days at current burn rate
- SE tax accrued (15% of gross — do not touch)
- Monthly gross and net projections
- Phase indicator (Phase 1 rental / Phase 2 owned vehicle / Phase 3 contracting)
- Weekly surplus above $3,500 monthly nut

**Job Search:**
- Applications sent per day and per week
- Recruiter contacts
- LinkedIn posts, comments, connections
- Interviews scheduled
- Follow-ups sent
- Consecutive days active (streak)

---

## 14. Claude Code Session Startup Prompt

Use this to open your Claude Code session:

```
I am building a driver metrics PWA called RoadMap.
Full spec is in DRIVER_METRICS_APP_SPEC.md in this directory.
Read the spec completely before writing any code.
Start with Phase 1 — infrastructure.
Monorepo structure, docker-compose.yml, and .env.example first.
Confirm Docker Compose boots clean before moving to Phase 2.
All constraints in Section 12 are non-negotiable throughout the entire build.
Do not proceed to the next phase until the current phase is confirmed working.
```

---

*Spec version 1.0 — built from full strategy session March 2026*
*Owner: Matt Marks — ArcForge.AI*
