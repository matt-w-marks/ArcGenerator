# ── Build stage — install deps only ──────────────────────────────────────────
FROM python:3.12.10-slim-bookworm AS deps

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip==25.1.1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12.10-slim-bookworm AS runtime

WORKDIR /app

# Create non-root user
RUN addgroup --system appgroup \
 && adduser --system --ingroup appgroup --no-create-home appuser

# Copy installed packages from build stage (avoids build tools in runtime image)
COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=deps /usr/local/bin/uvicorn    /usr/local/bin/uvicorn

# Copy only runtime source files — exclude tests/, alembic/, *.pyc
COPY --chown=appuser:appgroup alembic/     ./alembic/
COPY --chown=appuser:appgroup alembic.ini  ./
COPY --chown=appuser:appgroup models/      ./models/
COPY --chown=appuser:appgroup routers/     ./routers/
COPY --chown=appuser:appgroup schemas/     ./schemas/
COPY --chown=appuser:appgroup audit.py  database.py  factory_log.py  main.py  role_guard.py  ./

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
