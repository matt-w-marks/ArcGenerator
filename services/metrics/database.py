"""
Database connection with dual-mode authentication.

- Local dev: uses DATABASE_URL with embedded password (e.g.
  postgresql+psycopg://arcgen:pw@localhost:5432/arcgenerator)

- Production (Azure): uses Microsoft Entra token authentication.
  Set AZURE_CLIENT_ID to the client ID of the user-assigned managed
  identity attached to the Container App. The DATABASE_URL should
  contain the username (matching the registered Postgres role) and
  no password — the password is fetched at runtime as an Entra token.

Mode is selected by checking AZURE_CLIENT_ID. If unset, password auth
is used as-is.
"""
import os
import time
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]
AZURE_CLIENT_ID = os.environ.get("AZURE_CLIENT_ID")
USE_ENTRA_AUTH = bool(AZURE_CLIENT_ID)

# Engine kwargs
_engine_kwargs = {"pool_pre_ping": True}

if USE_ENTRA_AUTH:
    # Lazy import so local dev doesn't need azure-identity installed if
    # the user prefers a slimmer venv (it's still in requirements.txt for prod).
    from azure.identity import ManagedIdentityCredential

    _credential = ManagedIdentityCredential(client_id=AZURE_CLIENT_ID)

    # Token cache. Tokens are valid ~24h; refresh 5 min before expiry.
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

    # Require SSL when using Azure Postgres
    _engine_kwargs["connect_args"] = {"sslmode": "require"}

    engine = create_engine(DATABASE_URL, **_engine_kwargs)

    # Inject a fresh token as the password before each new DBAPI connection.
    # SQLAlchemy fires this event when the pool needs a new physical connection;
    # it does not fire on every checkout from the pool.
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
