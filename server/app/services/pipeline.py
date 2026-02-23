# ─────────────────────────────────────────────────────────────────────────────
# Pipeline Orchestrator — core generation business logic
# ─────────────────────────────────────────────────────────────────────────────
# Endpoints delegate here. This owns:
#   - Cache check
#   - Template resolution
#   - Image generation → mesh generation → point sampling
#   - Primary / fallback decision logic
#   - Timeout + GPU OOM recovery
# ─────────────────────────────────────────────────────────────────────────────


import asyncio
import time

import structlog

import numpy as np

from app.cache.shape_cache import ShapeCache
from app.config import Settings
from app.exceptions import GenerationFailedError, GenerationTimeoutError, GPUOutOfMemoryError
from app.models.registry import ModelRegistry
from app.pipeline.encoding import compute_bbox, encode_float32, encode_uint8
from app.pipeline.point_sampler import normalize_positions, sample_from_part_meshes
from app.pipeline.prompt_templates import get_canonical_prompt
from app.pipeline.template_matcher import get_template
from app.schemas import BoundingBox, GenerateRequest, GenerateResponse

logger = structlog.get_logger(__name__)


class PipelineOrchestrator:
    """Orchestrates: cache check → image gen → mesh gen → point sampling.

    All GPU-bound work runs in a thread executor via run_in_executor
    to avoid blocking the async event loop.

    Subsequent prompts (03, 04, 10) will fill in the real model calls.
    For now, _generate_sync returns mock data.
    """

    def __init__(self, registry: ModelRegistry, cache: ShapeCache, settings: Settings):
        self._registry = registry
        self._cache = cache
        self._settings = settings

    async def generate(self, request: GenerateRequest) -> GenerateResponse:
        """Full generation pipeline: cache → template → models → points."""
        start = time.perf_counter()

        # 1. Cache check
        cached = await self._cache.get(request.text)
        if cached is not None:
            cached.cached = True
            cached.generation_time_ms = int((time.perf_counter() - start) * 1000)
            return cached

        # 2. Template lookup
        template = get_template(request.text)
        logger.info(
            "generating",
            text=request.text,
            template=template.template_type,
            parts=template.num_parts,
        )

        # 3. Generate with timeout + GPU error recovery
        try:
            positions, part_ids, part_names, pipeline_used = await asyncio.wait_for(
                self._run_in_executor(request.text, template),
                timeout=self._settings.generation_timeout_seconds,
            )
        except asyncio.TimeoutError:
            raise GenerationTimeoutError(
                request.text, self._settings.generation_timeout_seconds
            )
        except Exception as e:
            # Catch CUDA OOM directly — more precise than string matching
            _is_oom = False
            try:
                import torch

                if isinstance(e, torch.cuda.OutOfMemoryError):
                    torch.cuda.empty_cache()
                    _is_oom = True
            except ImportError:
                pass
            if _is_oom:
                raise GPUOutOfMemoryError() from e
            raise GenerationFailedError(request.text, str(e)) from e

        # 4. Build response
        elapsed = int((time.perf_counter() - start) * 1000)
        bbox = compute_bbox(positions)

        response = GenerateResponse(
            positions=encode_float32(positions),
            part_ids=encode_uint8(part_ids),
            part_names=part_names,
            template_type=template.template_type,
            bounding_box=BoundingBox(min=bbox["min"], max=bbox["max"]),
            cached=False,
            generation_time_ms=elapsed,
            pipeline=pipeline_used,
        )

        # 5. Cache the result
        await self._cache.set(request.text, response)

        logger.info(
            "generated",
            text=request.text,
            time_ms=elapsed,
            pipeline=pipeline_used,
            parts=template.num_parts,
        )
        return response

    async def _run_in_executor(
        self, text: str, template: object
    ) -> tuple[np.ndarray, np.ndarray, list[str], str]:
        """Run synchronous GPU work in a thread to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._generate_sync, text, template)

    def _generate_sync(
        self, text: str, template: object
    ) -> tuple[np.ndarray, np.ndarray, list[str], str]:
        """Synchronous GPU pipeline — runs in thread pool via run_in_executor.

        Primary path: SDXL Turbo → PartCrafter → point sampling.
        Falls back to mock data if models aren't loaded (e.g. in tests).
        """
        total_points = self._settings.max_points

        # Canonical prompt
        prompt = get_canonical_prompt(text, template.template_type)
        logger.info("canonical_prompt", prompt=prompt)

        # ── Step 1: Image generation (SDXL Turbo) ───────────────────────────
        pipeline_used = "mock"
        reference_image = None

        if self._registry.has("sdxl_turbo"):
            sdxl = self._registry.get("sdxl_turbo")
            t0 = time.perf_counter()
            reference_image = sdxl.generate(prompt)
            image_ms = round((time.perf_counter() - t0) * 1000, 1)
            logger.info(
                "sdxl_image_generated",
                size=f"{reference_image.width}x{reference_image.height}",
                text=text,
                time_ms=image_ms,
            )
            pipeline_used = "sdxl_turbo+mock"

        # ── Step 2: Part mesh generation (PartCrafter) ──────────────────────
        if reference_image is not None and self._registry.has("partcrafter"):
            partcrafter = self._registry.get("partcrafter")
            t0 = time.perf_counter()
            part_meshes = partcrafter.generate(
                reference_image, num_parts=template.num_parts
            )
            mesh_ms = round((time.perf_counter() - t0) * 1000, 1)

            # Count real meshes (non-dummy) — dummies have only 1 vertex
            real_count = sum(1 for m in part_meshes if len(m.vertices) > 1)

            # Validate part count against template expectation
            if real_count < max(template.num_parts * 0.5, 1):
                logger.warning(
                    "partcrafter_insufficient_parts",
                    text=text,
                    expected=template.num_parts,
                    real=real_count,
                    total=len(part_meshes),
                )

            # Filter out dummy meshes (1-vertex) for point sampling
            valid_meshes = [m for m in part_meshes if len(m.vertices) > 1]
            if not valid_meshes:
                # All meshes failed — fall back to mock
                logger.error("partcrafter_all_meshes_failed", text=text)
            else:
                # ── Step 3: Point sampling ──────────────────────────────────
                t1 = time.perf_counter()
                positions, part_ids = sample_from_part_meshes(
                    valid_meshes, total_points=total_points
                )
                sample_ms = round((time.perf_counter() - t1) * 1000, 1)

                # Truncate part names to match actual mesh count
                part_names = template.part_names[: len(valid_meshes)]
                pipeline_used = "partcrafter"

                logger.info(
                    "primary_pipeline_complete",
                    text=text,
                    real_parts=real_count,
                    total_parts=len(part_meshes),
                    image_ms=image_ms,
                    mesh_ms=mesh_ms,
                    sample_ms=sample_ms,
                )

                return positions, part_ids, part_names, pipeline_used

        # ── Fallback: Mock point cloud ──────────────────────────────────────
        rng = np.random.default_rng(hash(text) % (2**32))
        theta = rng.uniform(0, 2 * np.pi, total_points)
        phi = rng.uniform(0, np.pi, total_points)
        r = 0.8 + rng.normal(0, 0.1, total_points)
        positions = np.stack(
            [
                r * np.sin(phi) * np.cos(theta),
                r * np.sin(phi) * np.sin(theta),
                r * np.cos(phi),
            ],
            axis=1,
        ).astype(np.float32)

        positions, _ = normalize_positions(positions)
        part_ids = rng.integers(0, template.num_parts, total_points).astype(np.uint8)

        return positions, part_ids, template.part_names, pipeline_used

