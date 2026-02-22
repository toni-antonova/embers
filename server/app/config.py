# ─────────────────────────────────────────────────────────────────────────────
# Settings — Pydantic v2 BaseSettings
# ─────────────────────────────────────────────────────────────────────────────


from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Server configuration sourced from environment variables.

    Uses pydantic-settings v2 (separate package from pydantic).
    """

    model_config = SettingsConfigDict(env_prefix="", env_file=".env")

    # ── Infrastructure ───────────────────────────────────────────────────────
    cache_bucket: str = "lumen-shape-cache-dev"
    model_cache_dir: str = "/home/appuser/models"
    port: int = 8080

    # ── Feature flags ────────────────────────────────────────────────────────
    skip_model_load: bool = False  # True for testing without GPU
    enable_debug_routes: bool = True

    # ── Limits ───────────────────────────────────────────────────────────────
    max_request_text_length: int = 200
    generation_timeout_seconds: int = 15
    max_points: int = 2048

    # ── Logging ──────────────────────────────────────────────────────────────
    log_level: str = "INFO"
    log_json: bool = True  # JSON logs for Cloud Logging


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
