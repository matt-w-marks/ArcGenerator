"""
Database connection with dual-mode authentication.

- Local dev: uses DATABASE_URL with embedded password
- Production (Azure): uses Microsoft Entra token authentication via the
  managed identity attached to the Container App. Selected by AZURE_CLIENT_ID.

See services/metrics/database.py for the full pattern documentation.
"""
import os
import time
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID")
USE_ENTRA_AUTH = bool(AZURE_CLIENT_ID)

_engine_kwargs = {"pool_pre_ping": True}

if USE_ENTRA_AUTH:
    from azure.identity import ManagedIdentityCredential

    _credential = ManagedIdentityCredential(client_id=AZURE_CLIENT_ID)

    _cached_token: str | None = None
    _cached_expires_on: float = 0.0
    _REFRESH_BUFFER_SECONDS = 5 * 60

    def _get_database_token() -> str:
        global _cached_token, _cached_expires_on
        if _cached_token and time.time() < _cached_expires_on - _REFRESH_BUFFER_SECONDS:
            return _cached_token
        token = _credential.get_token("https://ossrdbms-aad.database.windows.net/.default")
        if not token:
            raise RuntimeError("Failed to acquire Entra access token for Postgres")
        _cached_token = token.token
        _cached_expires_on = float(token.expires_on)
        return _cached_token

    _engine_kwargs["connect_args"] = {"sslmode": "require"}
    engine = create_engine(DATABASE_URL, **_engine_kwargs)

    @event.listens_for(engine, "do_connect")
    def _provide_token(dialect, conn_rec, cargs, cparams):  # noqa: ARG001
        cparams["password"] = _get_database_token()
else:
    engine = create_engine(DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
