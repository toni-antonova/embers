# ─────────────────────────────────────────────────────────────────────────────
# API Key Authentication Middleware
# ─────────────────────────────────────────────────────────────────────────────
# Validates X-API-Key header on all non-exempt requests.
#
# Design decisions:
#   - Uses secrets.compare_digest for constant-time comparison (prevents
#     timing side-channel attacks on the API key).
#   - Exempt paths are stored as a frozenset for O(1) lookup.
#   - Disabled when api_key is empty (local dev / test environments).
#   - Uses BaseHTTPMiddleware for consistency with RequestContextMiddleware.
#   - Returns JSON error in the same shape as LumenError handlers
#     ({"error": ...}) for client consistency.
# ─────────────────────────────────────────────────────────────────────────────


import secrets
from typing import Any

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = structlog.get_logger(__name__)

# Paths exempt from API key authentication.
# Health probes must be unauthenticated for Cloud Run liveness/readiness.
# Root "/" returns 404 by default but should not require auth (crawlers, etc).
_EXEMPT_PATHS: frozenset[str] = frozenset(
    {
        "/",
        "/health",
        "/health/ready",
        "/metrics",
    }
)


class APIKeyMiddleware(BaseHTTPMiddleware):
    """Reject requests that lack a valid ``X-API-Key`` header.

    Cloud Run health probes (``/health``, ``/health/ready``) are exempt
    so the container can pass liveness/readiness checks without a key.

    The middleware is **disabled** when the configured API key is empty,
    allowing local development and test suites to run without secrets.
    """

    def __init__(self, app: Any, *, api_key: str) -> None:
        super().__init__(app)
        self._api_key = api_key

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip auth for exempt paths (health probes, root)
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        # Extract key from header
        provided_key = request.headers.get("x-api-key", "")

        # Constant-time comparison prevents timing attacks.
        # An attacker who can measure response time precisely could
        # otherwise brute-force the key character-by-character with
        # a naive == comparison.
        if not provided_key or not secrets.compare_digest(provided_key, self._api_key):
            logger.warning(
                "auth_rejected",
                path=request.url.path,
                method=request.method,
                reason="invalid_or_missing_api_key",
            )
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid or missing API key"},
            )

        return await call_next(request)
