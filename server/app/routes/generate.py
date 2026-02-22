# ─────────────────────────────────────────────────────────────────────────────
# POST /generate — point cloud generation endpoint (THIN)
# ─────────────────────────────────────────────────────────────────────────────


from fastapi import APIRouter, Depends, Request

from app.dependencies import get_pipeline_orchestrator
from app.rate_limit import limiter
from app.schemas import GenerateRequest, GenerateResponse
from app.services.pipeline import PipelineOrchestrator

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
@limiter.limit("60/minute")
async def generate(
    request: Request,
    body: GenerateRequest = Depends(),
    orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator),
) -> GenerateResponse:
    """Generate a part-labeled point cloud from a text concept.

    Rate-limited to 60 requests/minute per IP to prevent GPU cost abuse.
    Validation is Pydantic. Errors are exceptions. Logic is in the orchestrator.
    This endpoint is just wiring.
    """
    return await orchestrator.generate(body)
