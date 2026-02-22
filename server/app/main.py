# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Application Factory + Lifespan
# ─────────────────────────────────────────────────────────────────────────────
# Entrypoint: uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8080
# The --factory flag tells uvicorn to call create_app() for the app instance.
# ─────────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager

import structlog

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.shape_cache import ShapeCache
from app.config import get_settings
from app.exceptions import register_exception_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware
from app.models.registry import ModelRegistry
from app.routes import debug, generate, health
from app.services.pipeline import PipelineOrchestrator

logger = structlog.get_logger(__name__)


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

    # Load SDXL Turbo (gated behind skip_model_load for test environments)
    if not settings.skip_model_load:
        from app.models.sdxl_turbo import SDXLTurboModel

        sdxl = SDXLTurboModel(device="cuda")
        registry.register("sdxl_turbo", sdxl)

    # Initialize cache
    cache = ShapeCache(bucket_name=settings.cache_bucket)
    await cache.connect()

    # Store in app.state — accessed via dependency functions in dependencies.py
    # Create the pipeline orchestrator (lifecycle-managed, not per-request)
    orchestrator = PipelineOrchestrator(registry, cache, settings)

    app.state.model_registry = registry
    app.state.shape_cache = cache
    app.state.settings = settings
    app.state.pipeline_orchestrator = orchestrator

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
