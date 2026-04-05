import os
from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from routers import audit, driving_sessions, financial_snapshots, job_activities, maintenance, platforms, reports, schedule, shift_log, weekly_rollups, zones


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Skip migrations during test runs (pytest sets PYTEST_CURRENT_TEST automatically)
    if not os.environ.get("PYTEST_CURRENT_TEST"):
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
    yield


app = FastAPI(title="Metrics Service", lifespan=lifespan, redirect_slashes=False)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


app.include_router(driving_sessions.router)
app.include_router(job_activities.router)
app.include_router(financial_snapshots.router)
app.include_router(weekly_rollups.router)
app.include_router(zones.router)
app.include_router(maintenance.router)
app.include_router(platforms.router)
app.include_router(audit.router)
app.include_router(reports.router)
app.include_router(schedule.router)
app.include_router(shift_log.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "metrics"}
