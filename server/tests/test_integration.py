# ─────────────────────────────────────────────────────────────────────────────
# Integration tests — full request flow with mocked models
# ─────────────────────────────────────────────────────────────────────────────
# Manually initializes app.state (ASGITransport doesn't run lifespan).
# All GPU models are mocked via skip_model_load=True.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

import os
from unittest.mock import MagicMock

import PIL.Image
import pytest
import trimesh
from httpx import ASGITransport, AsyncClient

# Set env BEFORE importing app modules
os.environ["SKIP_MODEL_LOAD"] = "true"
os.environ["CACHE_BUCKET"] = ""


@pytest.fixture
async def client():
    """Create an httpx AsyncClient with manually-initialized app state."""
    from app.cache.shape_cache import ShapeCache
    from app.config import Settings
    from app.main import create_app
    from app.models.registry import ModelRegistry
    from app.services.metrics import PipelineMetrics
    from app.services.pipeline import PipelineOrchestrator

    app = create_app()

    # Manually initialize app.state (lifespan doesn't run with ASGITransport)
    settings = Settings(cache_bucket="", skip_model_load=True)
    registry = ModelRegistry(settings)
    cache = ShapeCache(bucket_name="", memory_capacity=10)
    await cache.connect()
    metrics = PipelineMetrics()
    orchestrator = PipelineOrchestrator(registry, cache, settings, metrics=metrics)

    app.state.model_registry = registry
    app.state.shape_cache = cache
    app.state.settings = settings
    app.state.metrics = metrics
    app.state.pipeline_orchestrator = orchestrator

    # Register mock models
    sdxl = MagicMock()
    sdxl.generate.return_value = PIL.Image.new("RGB", (512, 512))
    registry.register("sdxl_turbo", sdxl)

    partcrafter = MagicMock()
    meshes = [trimesh.creation.box(extents=[0.2, 0.2, 0.2]) for _ in range(6)]
    partcrafter.generate.return_value = meshes
    registry.register("partcrafter", partcrafter)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


class TestGenerateEndpoint:
    """Tests for POST /generate."""

    @pytest.mark.asyncio
    async def test_valid_request_returns_200(self, client: AsyncClient) -> None:
        response = await client.post("/generate", params={"text": "horse"})
        assert response.status_code == 200
        data = response.json()
        assert "positions" in data
        assert "part_ids" in data
        assert "template_type" in data
        assert data["cached"] is False

    @pytest.mark.asyncio
    async def test_empty_text_returns_422(self, client: AsyncClient) -> None:
        response = await client.post("/generate", params={"text": ""})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_too_long_text_returns_422(self, client: AsyncClient) -> None:
        response = await client.post("/generate", params={"text": "a" * 201})
        assert response.status_code == 422


class TestCacheIntegration:
    """Tests that caching works end-to-end."""

    @pytest.mark.asyncio
    async def test_second_request_hits_cache(self, client: AsyncClient) -> None:
        r1 = await client.post("/generate", params={"text": "cat"})
        assert r1.status_code == 200
        assert r1.json()["cached"] is False

        r2 = await client.post("/generate", params={"text": "cat"})
        assert r2.status_code == 200
        assert r2.json()["cached"] is True


class TestHealthEndpoints:
    @pytest.mark.asyncio
    async def test_liveness_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_readiness_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/health/ready")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_detailed_health(self, client: AsyncClient) -> None:
        response = await client.get("/health/detailed")
        assert response.status_code == 200
        data = response.json()
        assert "models_loaded" in data
        assert "fallback_loaded" in data
        assert "status" in data


class TestMetricsEndpoint:
    @pytest.mark.asyncio
    async def test_metrics_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/metrics")
        assert response.status_code == 200
        data = response.json()
        assert "requests_total" in data
        assert "latency_p50_ms" in data
        assert "cache_hit_rate" in data
        assert "uptime_seconds" in data
        assert data["uptime_seconds"] >= 0

    @pytest.mark.asyncio
    async def test_metrics_track_requests(self, client: AsyncClient) -> None:
        await client.post("/generate", params={"text": "dog"})
        data = (await client.get("/metrics")).json()
        assert data["requests_total"] >= 1
