from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. PostgreSQL only — there is no SQLite fallback.

    DATABASE_URL must be a PostgreSQL DSN. Point it at the local dev cluster (see
    scripts/pg-start.ps1) or a managed instance; docker-compose provides one in a
    containerized run.
    """

    database_url: str = "postgresql+psycopg://apuser:appass@localhost:5432/apinvoice"
    seed_on_start: bool = True
    cors_origins: str = "http://localhost:3000"
    # Signing secret for the mock email-approval tokens (FR-43). Not a real secret.
    email_token_secret: str = "dev-email-token-secret"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def _require_postgres(cls, v: str) -> str:
        if not v.startswith(("postgresql://", "postgresql+psycopg://", "postgres://")):
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL DSN (e.g. postgresql+psycopg://user:pass@host:5432/db). "
                "SQLite is no longer supported."
            )
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
