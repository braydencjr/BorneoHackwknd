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
import app.models  # noqa: F401 — registers all ORM models with Base.metadata
from app.routes import health, auth, transactions, summary, contingency

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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — all endpoints live under /api/v1 for versioning
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api/v1/health", tags=["health"])
app.include_router(auth.router,   prefix="/api/v1/auth",   tags=["auth"])
app.include_router(transactions.router,prefix="/api/v1/transactions",tags=["transactions"],)
app.include_router(summary.router, prefix="/api/v1/summary", tags=["summary"])
app.include_router(contingency.router, prefix="/api/v1/contingency", tags=["contingency"])