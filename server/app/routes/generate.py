# ─────────────────────────────────────────────────────────────────────────────
# POST /generate — point cloud generation endpoint (THIN)
# ─────────────────────────────────────────────────────────────────────────────


from fastapi import APIRouter, Depends

from app.dependencies import get_pipeline_orchestrator
from app.schemas import GenerateRequest, GenerateResponse
from app.services.pipeline import PipelineOrchestrator

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    request: GenerateRequest,
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> GenerateResponse:
    """Generate a part-labeled point cloud from a text concept.

    Validation is Pydantic. Errors are exceptions. Logic is in the orchestrator.
    This endpoint is just wiring.
    """
    return await orchestrator.generate(request)
