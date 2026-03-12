import ssl
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.config import get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Build connect_args for MySQL SSL if configured
# ---------------------------------------------------------------------------
_connect_args: dict = {}

if settings.DATABASE_URL.startswith("mysql"):
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    # Load CA cert if provided (verifies server identity)
    if settings.MYSQL_SSL_CA:
        try:
            ssl_ctx.load_verify_locations(cafile=settings.MYSQL_SSL_CA)
            if settings.MYSQL_SSL_VERIFY:
                ssl_ctx.verify_mode = ssl.CERT_REQUIRED
        except FileNotFoundError:
            pass  # CA cert missing — continue without it

    # Load client cert + key only if BOTH are provided and exist
    if settings.MYSQL_SSL_CERT and settings.MYSQL_SSL_KEY:
        ssl_ctx.load_cert_chain(
            certfile=settings.MYSQL_SSL_CERT,
            keyfile=settings.MYSQL_SSL_KEY,
        )

    _connect_args["ssl"] = ssl_ctx

# ---------------------------------------------------------------------------
# Engine — aiosqlite for dev, aiomysql for MySQL, asyncpg for PostgreSQL
# ---------------------------------------------------------------------------
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    future=True,
    connect_args=_connect_args,

    # New settings to avoid connection being dropped after long idle
    pool_pre_ping=True,      # Checks if connection is alive before every use
    pool_recycle=3600,       # Force refresh connections every hour
    pool_size=10,            # Adjust based on your load
    max_overflow=20,         # Allow some bursting
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


async def create_tables() -> None:
    """Create all tables on startup (dev convenience). Use Alembic in production."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Dev SQLite compatibility patch:
        # If an existing users table was created before profile_photo was added,
        # queries selecting the ORM model will fail with "no such column".
        if settings.DATABASE_URL.startswith("sqlite"):
            result = await conn.execute(text("PRAGMA table_info(users)"))
            existing_columns = {row[1] for row in result.fetchall()}
            if "profile_photo" not in existing_columns:
                await conn.execute(text("ALTER TABLE users ADD COLUMN profile_photo VARCHAR(500)"))


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise