# ─────────────────────────────────────────────────────────────────────────────
# Health Check Routes — split into liveness, readiness, and diagnostics
# ─────────────────────────────────────────────────────────────────────────────
# Best practices (Google Cloud Run + Kubernetes):
#
#   /health        → Liveness probe. "Is the process alive?" Near-zero cost.
#                    Returns 200 always. Cloud Run restarts on failure.
#
#   /health/ready  → Readiness / startup probe. "Can it serve traffic?"
#                    Checks models loaded + cache connected.
#                    Returns 503 if not ready; Cloud Run withholds traffic.
#
#   /debug/health  → Full diagnostics (mounted in debug.py, not here).
#                    GPU stats, memory, cache, uptime — for humans only.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.cache.shape_cache import ShapeCache
from app.dependencies import get_cache, get_model_registry
from app.models.registry import ModelRegistry
from app.schemas import LivenessResponse, ReadinessResponse

router = APIRouter()


@router.get("/health", response_model=LivenessResponse)
async def liveness() -> LivenessResponse:
    """Liveness probe — is the process alive?

    Cloud Run hits this every ~30s. If it fails 3× consecutively,
    the container is restarted. Keep it absolutely minimal:
    no deps, no I/O, no imports inside the function.
    """
    return LivenessResponse(status="ok")


@router.get("/health/ready", response_model=ReadinessResponse)
async def readiness(
    registry: ModelRegistry = Depends(get_model_registry),
    cache: ShapeCache = Depends(get_cache),
) -> JSONResponse:
    """Readiness / startup probe — can this instance serve traffic?

    Used as Cloud Run's startup probe during model loading, and can
    also be configured as a readiness probe. Returns 503 if models
    aren't loaded or cache isn't connected, causing Cloud Run to
    withhold traffic (but NOT restart the container).
    """
    models_loaded = registry.loaded_names
    cache_connected = cache.is_connected

    ready = len(models_loaded) > 0 or registry.skip_loading
    ready = ready and cache_connected

    response = ReadinessResponse(
        status="ready" if ready else "not_ready",
        models_loaded=models_loaded,
        cache_connected=cache_connected,
    )

    return JSONResponse(
        status_code=200 if ready else 503,
        content=response.model_dump(),
    )
