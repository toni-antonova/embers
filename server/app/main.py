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
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.auth import APIKeyMiddleware
from app.cache.shape_cache import ShapeCache
from app.config import get_settings
from app.exceptions import register_exception_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware
from app.models.registry import ModelRegistry
from app.rate_limit import limiter
from app.routes import debug, generate, health
from app.services.pipeline import PipelineOrchestrator

logger = structlog.get_logger(__name__)


async def _rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    """Return a structured JSON 429 consistent with LumenError responses."""
    logger.warning(
        "rate_limit_exceeded",
        path=request.url.path,
        method=request.method,
        detail=str(exc.detail),
    )
    return JSONResponse(
        status_code=429,
        content={"error": f"Rate limit exceeded: {exc.detail}"},
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown lifecycle.

    Replaces the deprecated @app.on_event("startup") / "shutdown" pattern.
    All stateful objects (models, cache, metrics) are created here and
    stored in app.state for injection via Depends().

    Models load in a background task so uvicorn binds the port
    immediately.  The /health/ready probe returns 503 until models
    finish loading; /generate returns ModelNotLoadedError (503) until
    the registry is populated.
    """
    import asyncio

    settings = get_settings()

    # Initialize model registry (no models loaded yet)
    registry = ModelRegistry(settings)

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

    # Load models in background after app is already serving
    if not settings.skip_model_load:
        asyncio.create_task(_load_models(registry))

    yield  # App is running, serving requests

    # Shutdown
    await cache.disconnect()


async def _load_models(registry: ModelRegistry) -> None:
    """Load ML models in background so the app serves probes immediately.

    Runs as an asyncio task kicked off during lifespan.  Model init is
    CPU/GPU-bound, so we run it in a thread to avoid blocking the event
    loop (which would stall health probe responses).
    """
    import asyncio

    loop = asyncio.get_running_loop()

    try:
        logger.info("background_model_load_start")

        def _load() -> None:
            from app.models.sdxl_turbo import SDXLTurboModel

            sdxl = SDXLTurboModel(device="cuda")
            registry.register("sdxl_turbo", sdxl)

            from app.models.partcrafter import PartCrafterModel

            partcrafter = PartCrafterModel(device="cuda")
            registry.register("partcrafter", partcrafter)

            # ── VRAM budget check ───────────────────────────────────────────
            try:
                import torch

                if torch.cuda.is_available():
                    allocated = torch.cuda.memory_allocated() / 1e9
                    total = torch.cuda.get_device_properties(0).total_memory / 1e9
                    logger.info(
                        "vram_budget",
                        allocated_gb=round(allocated, 2),
                        total_gb=round(total, 2),
                        free_gb=round(total - allocated, 2),
                    )
            except ImportError:
                pass

        await loop.run_in_executor(None, _load)
        logger.info("background_model_load_complete")
    except Exception:
        logger.exception("background_model_load_failed")
        raise


def _parse_origins(allowed_origins: str) -> list[str]:
    """Parse comma-separated origin string into a list.

    Returns ``["*"]`` if the input is empty (development mode).
    Strips whitespace from each origin.
    """
    if not allowed_origins.strip():
        return ["*"]
    return [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]


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

    # ── Attach rate limiter to app state (required by slowapi) ───────────────
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # ── Middleware stack ─────────────────────────────────────────────────────
    # Starlette applies middleware in reverse order of add_middleware calls.
    # The execution order for an incoming request is:
    #   CORS → APIKey → RequestContext → route handler
    #
    # This ensures:
    #   1. CORS handles OPTIONS preflight before auth (no API key on preflight)
    #   2. APIKey rejects unauthenticated requests before they reach business logic
    #   3. RequestContext logs timing and attaches request ID to all responses

    # Innermost — runs last, logs timing + request ID
    app.add_middleware(RequestContextMiddleware)

    # Middle — API key gate (disabled when api_key is empty)
    api_key_value = settings.api_key.get_secret_value()
    if api_key_value:
        app.add_middleware(APIKeyMiddleware, api_key=api_key_value)
        logger.info("api_key_auth_enabled")
    else:
        logger.warning("api_key_auth_disabled", reason="API_KEY env var not set")

    # Outermost — CORS headers + preflight handling
    origins = _parse_origins(settings.allowed_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    # ── Exception handlers ───────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routes ───────────────────────────────────────────────────────────────
    app.include_router(health.router, tags=["health"])
    app.include_router(generate.router, tags=["generate"])
    if settings.enable_debug_routes:
        app.include_router(debug.router, prefix="/debug", tags=["debug"])

    return app
