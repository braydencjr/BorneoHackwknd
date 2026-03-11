import sys
from contextlib import asynccontextmanager

# Windows: async SSL over TCP requires SelectorEventLoop (ProactorEventLoop breaks SSL)
if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import create_tables
from app.routes import health, auth, resilience, transactions, summary, notifications, spending

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup / shutdown logic."""
    await create_tables()          # create DB tables on startup
    yield
    # add cleanup here if needed (e.g. close connection pools)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="BorneoHackwknd API",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — allow Expo web (localhost:19006) and your dev machine LAN IP.
# Tighten allow_origins in production to your real domain only.
# ---------------------------------------------------------------------------
cors_origins = settings.ALLOWED_ORIGINS
cors_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

# `*` + credentials can behave inconsistently across clients/browsers.
# Use regex wildcard when "allow all" is requested.
if "*" in cors_origins:
    cors_kwargs["allow_origin_regex"] = ".*"
else:
    cors_kwargs["allow_origins"] = cors_origins

app.add_middleware(CORSMiddleware, **cors_kwargs)

# ---------------------------------------------------------------------------
# Routers — all endpoints live under /api/v1 for versioning
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api/v1/health", tags=["health"])
app.include_router(auth.router,   prefix="/api/v1/auth",   tags=["auth"])
app.include_router(transactions.router,prefix="/api/v1/transactions",tags=["transactions"],)
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(resilience.router, prefix="/api/v1/resilience", tags=["resilience"])
app.include_router(summary.router, prefix="/api/v1/summary", tags=["summary"])


app.include_router(spending.router,  prefix="/api/v1/spending",  tags=["spending"])
