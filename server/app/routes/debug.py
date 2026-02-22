# ─────────────────────────────────────────────────────────────────────────────
# Debug Routes — for development and pipeline debugging
# ─────────────────────────────────────────────────────────────────────────────
# Only mounted when settings.enable_debug_routes is True.
# These will be used in Prompts 03/04 for step-by-step pipeline debugging.
# ─────────────────────────────────────────────────────────────────────────────

import time

from fastapi import APIRouter, Depends

from app.cache.shape_cache import ShapeCache
from app.dependencies import get_cache, get_model_registry
from app.models.registry import ModelRegistry
from app.schemas import HealthDetailResponse

router = APIRouter()

_start_time = time.time()


@router.get("/health", response_model=HealthDetailResponse)
async def health_detail(
    registry: ModelRegistry = Depends(get_model_registry),
    cache: ShapeCache = Depends(get_cache),
) -> HealthDetailResponse:
    """Full system diagnostics — GPU stats, cache info, uptime.

    Mounted at /debug/health. This is for humans and dashboards,
    NOT for Cloud Run probes (those use /health and /health/ready).
    """
    gpu_available = False
    gpu_name = None
    gpu_memory_used_gb = 0.0

    try:
        import torch

        gpu_available = torch.cuda.is_available()
        if gpu_available:
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory_used_gb = round(torch.cuda.memory_allocated() / 1e9, 1)
    except ImportError:
        pass

    cache_stats = await cache.stats()

    return HealthDetailResponse(
        status="healthy",
        models_loaded=registry.loaded_names,
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        gpu_memory_used_gb=gpu_memory_used_gb,
        cache_connected=cache.is_connected,
        cache_stats=cache_stats,
        uptime_seconds=int(time.time() - _start_time),
    )


@router.get("/models")
async def list_models(
    registry: ModelRegistry = Depends(get_model_registry),
) -> dict:
    """List all loaded models and their status."""
    return {
        "models": registry.loaded_names,
        "count": len(registry.loaded_names),
    }


@router.get("/cache/stats")
async def cache_stats(
    cache: ShapeCache = Depends(get_cache),
) -> dict:
    """Return detailed cache statistics."""
    return await cache.stats()


@router.post("/cache/clear")
async def cache_clear(
    cache: ShapeCache = Depends(get_cache),
) -> dict:
    """Clear the in-memory cache. Cloud Storage is not affected."""
    cache.clear_memory()
    return {"status": "cleared"}
