# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application Factory + Lifespan
# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint: uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8080
# The --factory flag tells uvicorn to call create_app() for the app instance.
# ─────────────────────────────────────────────────────────────────────────────

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.shape_cache import ShapeCache
from app.config import get_settings
from app.exceptions import register_exception_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware
from app.models.registry import ModelRegistry
from app.routes import debug, generate, health

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown lifecycle.

    Replaces the deprecated @app.on_event("startup") / "shutdown" pattern.
    All stateful objects (models, cache, metrics) are created here and
    stored in app.state for injection via Depends().
    """
    settings = get_settings()

    # Initialize model registry + load primary models
    registry = ModelRegistry(settings)
    registry.load_primary()

    # Initialize cache
    cache = ShapeCache(bucket_name=settings.cache_bucket)
    await cache.connect()

    # Store in app.state — accessed via dependency functions in dependencies.py
    app.state.model_registry = registry
    app.state.shape_cache = cache
    app.state.settings = settings

    yield  # App is running, serving requests

    # Shutdown
    await cache.disconnect()


def create_app() -> FastAPI:
    """Application factory. Invoked by: uvicorn app.main:create_app --factory

    The --factory flag tells uvicorn to call this function to get the app,
    rather than importing a module-level variable. This avoids side effects
    at import time and makes testing cleaner.
    """
    settings = get_settings()
    configure_logging(log_level=settings.log_level, json_output=settings.log_json)

    app = FastAPI(
        title="Lumen Pipeline",
        description="Speech-to-3D point cloud generation server",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Middleware (outermost applied first)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict in production
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestContextMiddleware)

    # Exception handlers
    register_exception_handlers(app)

    # Routes
    app.include_router(health.router, tags=["health"])
    app.include_router(generate.router, tags=["generate"])
    if settings.enable_debug_routes:
        app.include_router(debug.router, prefix="/debug", tags=["debug"])

    return app
