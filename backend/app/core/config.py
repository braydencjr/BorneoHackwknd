from functools import lru_cache

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "BorneoHackwknd API"
    VERSION: str = "0.1.0"

    # Security — override via .env
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — comma-separated in .env, e.g. ALLOWED_ORIGINS=http://localhost:19006,exp://192.168.1.x:19000
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:19006",
        "http://localhost:8081",
        "http://10.0.2.2:8000",       # Android emulator -> host
    ]

    # Database — override via .env
    # Dev SQLite:        sqlite+aiosqlite:///./dev.db
    # MySQL:             mysql+aiomysql://user:password@host:3306/dbname
    # Prod PostgreSQL:   postgresql+asyncpg://user:password@localhost:5432/dbname
    DATABASE_URL: str = "sqlite+aiosqlite:///./dev.db"
    DB_ECHO: bool = False  # set True to log all SQL in dev

    # MySQL SSL certificates (paths relative to backend/ or absolute)
    MYSQL_SSL_CA: str = ""
    MYSQL_SSL_CERT: str = ""
    MYSQL_SSL_KEY: str = ""
    # Set to False to skip CA verification (needed when CA cert lacks keyUsage extension)
    MYSQL_SSL_VERIFY: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Cached settings — only instantiated once per process."""
    return Settings()


# Convenience singleton for modules that import directly
settings = get_settings()
