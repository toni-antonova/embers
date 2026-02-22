# ─────────────────────────────────────────────────────────────────────────────
# Test Fixtures — shared across all tests
# ─────────────────────────────────────────────────────────────────────────────


from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.cache.shape_cache import ShapeCache
from app.config import Settings
from app.main import create_app
from app.models.registry import ModelRegistry


@pytest.fixture
def test_settings() -> Settings:
    """Settings configured for testing — no GPU, no Cloud Storage."""
    return Settings(
        cache_bucket="test-bucket",
        skip_model_load=True,
        enable_debug_routes=True,
        log_json=False,
        log_level="DEBUG",
    )


@pytest.fixture
def mock_registry(test_settings: Settings) -> ModelRegistry:
    """ModelRegistry that skips loading."""
    return ModelRegistry(test_settings)


@pytest.fixture
def mock_cache() -> ShapeCache:
    """ShapeCache with async methods mocked."""
    cache = MagicMock(spec=ShapeCache)
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock()
    cache.stats = AsyncMock(
        return_value={
            "memory_cache_size": 0,
            "memory_hits": 0,
            "storage_hits": 0,
            "misses": 0,
            "hit_rate": 0,
        }
    )
    cache.connect = AsyncMock()
    cache.disconnect = AsyncMock()
    cache.clear_memory = MagicMock()
    cache.is_connected = True
    return cache


@pytest.fixture
def client(test_settings: Settings, mock_registry: ModelRegistry, mock_cache: ShapeCache) -> TestClient:
    """FastAPI TestClient with mocked dependencies."""
    app = create_app()
    # Override app.state with test dependencies
    app.state.model_registry = mock_registry
    app.state.shape_cache = mock_cache
    app.state.settings = test_settings
    return TestClient(app)
