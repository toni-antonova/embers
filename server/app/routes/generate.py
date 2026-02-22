# ─────────────────────────────────────────────────────────────────────────────
# POST /generate — point cloud generation endpoint (THIN)
# ─────────────────────────────────────────────────────────────────────────────


from fastapi import APIRouter, Depends

from app.cache.shape_cache import ShapeCache
from app.config import Settings
from app.dependencies import get_cache, get_model_registry, get_settings_dep
from app.models.registry import ModelRegistry
from app.schemas import GenerateRequest, GenerateResponse
from app.services.pipeline import PipelineOrchestrator

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest,
    registry: ModelRegistry = Depends(get_model_registry),
    cache: ShapeCache = Depends(get_cache),
    settings: Settings = Depends(get_settings_dep),
) -> GenerateResponse:
    """Generate a part-labeled point cloud from a text concept.

    Validation is Pydantic. Errors are exceptions. Logic is in the orchestrator.
    This endpoint is just wiring.
    """
    orchestrator = PipelineOrchestrator(registry, cache, settings)
    return await orchestrator.generate(request)
