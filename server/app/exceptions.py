# ─────────────────────────────────────────────────────────────────────────────
# Custom Exceptions + FastAPI Exception Handlers
# ─────────────────────────────────────────────────────────────────────────────


import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = structlog.get_logger(__name__)


# ── Exception hierarchy ──────────────────────────────────────────────────────


class LumenError(Exception):
    """Base exception for all Lumen pipeline errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class ModelNotLoadedError(LumenError):
    """Raised when an endpoint needs a model that hasn't been loaded."""

    def __init__(self, model_name: str):
        super().__init__(f"Model '{model_name}' is not loaded", status_code=503)


class GenerationFailedError(LumenError):
    """Raised when the generation pipeline fails."""

    def __init__(self, concept: str, reason: str):
        super().__init__(f"Generation failed for '{concept}': {reason}", status_code=500)


class GenerationTimeoutError(LumenError):
    """Raised when generation exceeds the configured timeout."""

    def __init__(self, concept: str, timeout_s: float):
        super().__init__(
            f"Generation timed out for '{concept}' after {timeout_s}s",
            status_code=504,
        )


class GPUOutOfMemoryError(LumenError):
    """Raised when CUDA OOM occurs during generation."""

    def __init__(self):
        super().__init__(
            "GPU memory exhausted. Retry after a few seconds.",
            status_code=503,
        )


# ── Handler registration ────────────────────────────────────────────────────


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app.

    Endpoints raise LumenError subclasses; these handlers catch them
    and return structured JSON — no inline try/except in endpoints.
    """

    @app.exception_handler(LumenError)
    async def lumen_error_handler(request: Request, exc: LumenError) -> JSONResponse:
        logger.error("lumen_error", error=exc.message, error_type=type(exc).__name__, exc_info=exc)
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "type": type(exc).__name__},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_error", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "type": "UnhandledError"},
        )
