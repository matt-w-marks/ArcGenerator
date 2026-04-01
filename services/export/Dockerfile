# ── Build stage — install deps only ──────────────────────────────────────────
FROM python:3.12.10-slim-bookworm AS deps

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip==25.1.1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM python:3.12.10-slim-bookworm AS runtime

WORKDIR /app

RUN addgroup --system appgroup \
 && adduser --system --ingroup appgroup --no-create-home appuser

COPY --from=deps /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=deps /usr/local/bin/uvicorn    /usr/local/bin/uvicorn

# Copy only runtime source files — exclude tests/
COPY --chown=appuser:appgroup models/      ./models/
COPY --chown=appuser:appgroup routers/     ./routers/
COPY --chown=appuser:appgroup database.py  factory_log.py  main.py  ./

USER appuser

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]
