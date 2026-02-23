# Lumen — Tracking Work History (Part 2)

A continuation of the linear log of all meaningful code, architecture, and configuration changes as we develop the Lumen pipeline and infrastructure. (Continued from `tracking_work_history.md` entry #44).

## Table of Contents

| # | Entry | Date |
|---|-------|------|
| 45 | Deployment Bug Fix Chain — Docker, Dependencies, Python 3.13 | 2026-02-22 |
| 46 | Cloud Run Startup Probe + Background Model Loading | 2026-02-22 |
| 47 | MILESTONE: First Successful Cloud Run Deployment 🚀 | 2026-02-22 |
| 48 | MILESTONE: SDXL Turbo API — Live Text-to-Image Inference 🏎️ | 2026-02-22 |
| 49 | Prompt 03 Audit — AutoPipelineForText2Image Revert + Quality Verification | 2026-02-22 |
| 50 | PartCrafter Integration — Image → Part-Decomposed Meshes → Point Clouds | 2026-02-22 |

---

<details>
<summary><strong>45. Deployment Bug Fix Chain — Docker, Dependencies, Python 3.13</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

First Cloud Run build revealed a chain of 9 blocking issues that had to be fixed iteratively — each fix uncovered the next failure. These are the kinds of incompatibilities that only surface in a real CUDA container build, not in local dev:

| # | Commit | Error | Root Cause |
|---|--------|-------|------------|
| 1 | `2dd3680` | `E: Unable to locate package libegl1-mesa` | Ubuntu 24.04 (Noble) restructured Mesa packages |
| 2 | `ed65d59` | `WORKDIR: permission denied` | Directory created as root, then `USER appuser` couldn't write |
| 3 | `1831fe8` | `AttributeError: total_mem` | PyTorch 2.10 renamed `CudaDeviceProperties.total_mem` → `total_memory` |
| 4 | `d8541b5` | `ModuleNotFoundError: diffusers` | `diffusers` + `accelerate` were dev-only deps, missing from production |
| 5 | `514d555` | ~5 min cold builds | No Docker layer caching — full `uv sync` on every build |
| 6 | `6354f71` | `ImportError: transformers` | `transformers` + `safetensors` were transitive deps, not declared |
| 7 | `ff8b4e7` | `ImportError: sentencepiece` | `diffusers` lazily imports HunyuanDiT → MT5Tokenizer → sentencepiece |
| 8 | `a25c19c` | `sentencepiece` build fails on Python 3.14 | No pre-built wheels for Python 3.14; `AutoPipelineForText2Image` eagerly imports all pipelines |
| 9 | `0918bba` | Stale lockfile | `uv.lock` needed regeneration after Python version change |

</details>

<details>
<summary><strong>Fix</strong></summary>

**Docker fixes:**
- `libegl1-mesa` → `libegl1`, `libgl1-mesa-glx` → `libgl1` (Ubuntu 24.04 package rename)
- Added `RUN mkdir -p /home/appuser/app && chown appuser:appuser /home/appuser/app` before `USER appuser`

**API fix:**
- `torch.cuda.get_device_properties(0).total_mem` → `.total_memory` (PyTorch 2.10 rename)

**Dependency fixes:**
- Added explicit production deps: `diffusers>=0.33`, `accelerate>=1.7`, `transformers`, `safetensors`, `sentencepiece`, `protobuf`
- These were all transitive via `torch` or `diffusers` but not declared — worked locally because dev environment had them

**Python version downgrade:**
- Python 3.14 → 3.13 in `Dockerfile` and `pyproject.toml`
- `sentencepiece` has no pre-built wheel for 3.14, and building from source fails in the CUDA container
- Python 3.13 has full wheel support for the entire ML stack

**Import fix:**
- `AutoPipelineForText2Image` → `StableDiffusionXLPipeline` — avoids eager import of all pipeline modules (HunyuanDiT, Kandinsky, etc.)

**Build performance:**
- Added `--cache-from` layer caching + BuildKit `--mount=type=cache` for uv wheel persistence
- Code-only changes now skip the 2GB dependency layer → ~30-60s builds vs ~5 min

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `server/Dockerfile` | Mesa packages, WORKDIR permission, Python 3.14→3.13, BuildKit syntax |
| `server/pyproject.toml` | Added 6 explicit deps, Python version 3.14→3.13 |
| `server/uv.lock` | Regenerated for Python 3.13 (333 lines added) |
| `server/app/models/sdxl_turbo.py` | `AutoPipelineForText2Image` → `StableDiffusionXLPipeline` |
| `server/app/models/registry.py` | `total_mem` → `total_memory` |
| `infrastructure/cloudbuild.yaml` | Layer caching, BuildKit, separate push steps |

</details>

<details>
<summary><strong>Outcome</strong></summary>

- Docker image builds successfully on Cloud Build ✅
- All ML dependencies resolve and import cleanly ✅
- Python 3.13 provides full wheel coverage ✅
- Rebuild time reduced from ~5 min to ~30-60s for code-only changes ✅
- 9 commits: `2dd3680` through `0918bba` ✅

</details>

</details>

---

<details>
<summary><strong>46. Cloud Run Startup Probe + Background Model Loading</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

Cloud Run was killing the container during SDXL Turbo model download. The startup probe allowed 24 × 5s = 120s, but downloading and loading a ~3GB model from Hugging Face takes 3-5 minutes on Cloud Run's network. Meanwhile, the model loading was synchronous in `lifespan()`, which meant uvicorn couldn't bind the port until loading finished — so the startup probe had nothing to probe.

</details>

<details>
<summary><strong>Fix</strong></summary>

**Terraform** (`cloud_run.tf`):
```diff
  startup_probe {
-   failure_threshold     = 24
-   period_seconds        = 5
+   failure_threshold     = 60
+   period_seconds        = 10
+   initial_delay_seconds = 0
  }
```
Total timeout: 60 × 10s = **600s** (10 minutes). `initial_delay_seconds=0` so probes begin immediately.

**Application** (`main.py`):
- Moved model loading from synchronous `lifespan()` to an `asyncio` background task via `loop.run_in_executor()`
- uvicorn binds port immediately → Cloud Run startup probe succeeds on first `/health` check
- `/health/ready` returns **503** until model registry is populated
- `/generate` returns `ModelNotLoadedError` until registry has `sdxl_turbo`
- Model loads in a background thread without blocking the event loop

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `infrastructure/terraform/cloud_run.tf` | Startup probe: 120s → 600s timeout |
| `server/app/main.py` | Background model loading via `asyncio` + `run_in_executor` |

</details>

<details>
<summary><strong>Outcome</strong></summary>

- Container starts and passes health checks within seconds ✅
- Model loads in background without blocking request handling ✅
- `/health/ready` correctly reports 503 until models are loaded ✅
- 600s startup window accommodates even slow model downloads ✅
- Committed as `33656fe` ✅

</details>

</details>

---

<details>
<summary><strong>47. MILESTONE: First Successful Cloud Run Deployment 🚀</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Accomplished</strong></summary>

The Lumen ML pipeline server is now **live on Google Cloud Run** with GPU acceleration. This is the first successful end-to-end deployment — from Terraform infrastructure provisioning through Docker image build to a running, authenticated API endpoint.

Since the infrastructure and server skeleton were built (entries #39–#44), **9 deployment bug fixes** (entry #45) and **1 startup architecture fix** (entry #46) were needed to get from "code that works locally" to "container running in production."

</details>

<details>
<summary><strong>What's Deployed</strong></summary>

| Component | Detail |
|-----------|--------|
| **Compute** | Cloud Run v2, `us-east4`, NVIDIA L4 GPU (24GB VRAM) |
| **Container** | CUDA 12.8 + Python 3.13 + FastAPI + uvicorn |
| **Model** | SDXL Turbo (`stabilityai/sdxl-turbo`) loaded on startup |
| **Auth** | API key via Secret Manager + `secrets.compare_digest()` |
| **Rate Limiting** | 60 req/min per IP via slowapi |
| **CORS** | Configurable per environment via `ALLOWED_ORIGINS` |
| **Health** | `/health` (liveness) + `/health/ready` (readiness, 503 until model loaded) |
| **Endpoints** | `POST /generate`, `POST /debug/generate-image` |
| **Caching** | In-memory LRU (100 items) + Cloud Storage backend |
| **Logging** | structlog → Cloud Logging (JSON renderer) |
| **Build** | Cloud Build with BuildKit layer caching (~30-60s rebuilds) |

</details>

<details>
<summary><strong>Deployment Journey</strong></summary>

The path from `terraform apply` to a healthy container required solving problems across 4 layers:

1. **OS layer** — Ubuntu 24.04 renamed Mesa packages, Docker WORKDIR permissions
2. **Python layer** — Python 3.14 lacks wheel support for ML stack → downgraded to 3.13
3. **Dependency layer** — 6 transitive deps needed explicit declaration; diffusers eager-imports all pipeline modules
4. **Application layer** — PyTorch API rename (`total_mem`), synchronous model loading blocked startup probes

Each layer had to be fixed in order — you can't discover the Python 3.14 issue until the OS packages install, you can't discover the import issue until the deps install, etc.

</details>

<details>
<summary><strong>What's Next</strong></summary>

- **Prompt 04: PartCrafter integration** — wire `reference_image` from SDXL Turbo into the part segmentation model
- **Frontend ↔ API connection** — connect the dots client to the deployed `/generate` endpoint
- **Cost monitoring** — set up billing alerts for GPU usage
- **Model caching** — pre-bake model weights into the Docker image to eliminate cold-start download

</details>

</details>

---

<details>
<summary><strong>48. MILESTONE: SDXL Turbo API — Live Text-to-Image Inference on Cloud Run 🏎️</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Accomplished</strong></summary>

The Lumen ML pipeline's text-to-image inference endpoint is **fully operational in production**. The `POST /debug/generate-image` endpoint accepts authenticated requests, runs them through the `stabilityai/sdxl-turbo` model on an NVIDIA L4 GPU, and returns generated PNG images.

This milestone validates the entire stack end-to-end: Terraform-provisioned infrastructure → Cloud Build Docker image → Cloud Run container with GPU → FastAPI server → SDXL Turbo model inference → authenticated image response.

We verified by submitting **10 prompts of varying sentence complexity** (all <10 words) to the live production endpoint.

</details>

<details>
<summary><strong>Visual Verification — 10 Live API Generations</strong></summary>

| Prompt | Result |
|--------|--------|
| `a corrupt politician eats noodles` | ![Image 1](milestones/sdxl-turbo-api/image_01.png) |
| `a fast red sports car` | ![Image 2](milestones/sdxl-turbo-api/image_02.png) |
| `sunset over the calm ocean` | ![Image 3](milestones/sdxl-turbo-api/image_03.png) |
| `astronaut floating in deep space` | ![Image 4](milestones/sdxl-turbo-api/image_04.png) |
| `cat playing with red ball` | ![Image 5](milestones/sdxl-turbo-api/image_05.png) |
| `a futuristic cyberpunk neon city` | ![Image 6](milestones/sdxl-turbo-api/image_06.png) |
| `freshly baked chocolate chip cookies` | ![Image 7](milestones/sdxl-turbo-api/image_07.png) |
| `a wise old forest owl` | ![Image 8](milestones/sdxl-turbo-api/image_08.png) |
| `neon lights reflecting in puddle` | ![Image 9](milestones/sdxl-turbo-api/image_09.png) |
| `a glowing mushroom in forest` | ![Image 10](milestones/sdxl-turbo-api/image_10.png) |

</details>

<details>
<summary><strong>Performance Notes</strong></summary>

- **Cold start:** ~3–5 min (model download + VRAM loading on first container spin-up)
- **Warm inference:** Sub-second per image (SDXL Turbo's 1-step distilled architecture)
- **Auth:** API key via `X-API-Key` header, validated with `secrets.compare_digest()`
- **Rate limiting:** 60 req/min per IP via slowapi

</details>

<details>
<summary><strong>Live Stack</strong></summary>

```
curl -X POST https://lumen-pipeline-gldbd4c4ka-uk.a.run.app/debug/generate-image \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key>" \
  -d '{"text": "your prompt here"}' \
  --output result.png
```

| Layer | Detail |
|-------|--------|
| **Compute** | Cloud Run v2, `us-east4`, NVIDIA L4 (24GB VRAM) |
| **Runtime** | CUDA 12.8 + Python 3.13 + FastAPI + uvicorn |
| **Model** | `stabilityai/sdxl-turbo` via `AutoPipelineForText2Image` |
| **Auth** | Secret Manager → `X-API-Key` header |
| **Infra** | Terraform IaC, Cloud Build CI, Artifact Registry |

</details>

</details>

---

<details>
<summary><strong>49. Prompt 03 Audit — AutoPipelineForText2Image Revert + Quality Verification</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Done</strong></summary>

Systematic audit of all Prompt 03 requirements against the implementation. During the audit, identified and fixed one inconsistency: `sdxl_turbo.py` was using `StableDiffusionXLPipeline` (a workaround from the Python 3.14 era, entry #45) while the test suite mocked `AutoPipelineForText2Image`. Since the Dockerfile was already downgraded to Python 3.13 (which resolves the root cause), reverted to the canonical `AutoPipelineForText2Image` — the Stability AI recommended API.

</details>

<details>
<summary><strong>Changes</strong></summary>

| File | Changes |
|------|---------|
| `server/app/models/sdxl_turbo.py` | `StableDiffusionXLPipeline` → `AutoPipelineForText2Image` (import + usage, 2 lines) |

</details>

<details>
<summary><strong>Audit Results</strong></summary>

All 18 requirements from the Prompt 03 spec verified against the implementation:

| Category | Requirements | Status |
|----------|-------------|--------|
| Model wrapper (`sdxl_turbo.py`) | 16 items: import, model ID, dtype, device, progress bar, guidance, output size, timing, OOM, inference_mode, protocol props, VRAM logging, docstrings, structlog | ✅ All met |
| Architecture wiring (`main.py`) | Background loading via `run_in_executor`, `skip_model_load` check, registry.register | ✅ Exceeds spec |
| Pipeline integration (`pipeline.py`) | Conditional SDXL usage, canonical prompt, logging, mock fallback, TODO for Prompt 04 | ✅ All met |
| Debug endpoint (`debug.py`) | `POST /debug/generate-image`, Pydantic request, PNG response, 503 when not loaded | ✅ All met |
| Tests (`test_sdxl_turbo.py`) | Spec asked for 3 test areas; implementation has 14 tests across 5 test classes | ✅ Exceeds spec |

</details>

<details>
<summary><strong>Verification</strong></summary>

- All **14 tests passed** locally (`uv run pytest tests/test_sdxl_turbo.py -v` — 0.58s) ✅
- Deployed Cloud Run endpoint returned **HTTP 200** with a valid **512×512 RGB PNG** (308KB, ~1s) ✅

</details>

</details>

---

<details>
<summary><strong>50. PartCrafter Integration — Image → Part-Decomposed Meshes → Point Clouds</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Done</strong></summary>

Integrated PartCrafter (NeurIPS 2025) into the Lumen pipeline as the second ML model. The pipeline now generates **real 3D geometry** instead of mock spherical point clouds:

**Text → SDXL Turbo image → BriaRMBG background removal → PartCrafter part-decomposed meshes → surface-sampled point cloud with semantic part IDs**

Key design decisions:
- **BriaRMBG as separate timed step** — SDXL Turbo images have backgrounds; PartCrafter expects white-bg. RMBG timing is logged independently.
- **Vendored PartCrafter** — Not pip-installable, so downloaded as a tarball pinned to commit SHA `269bd41` for reproducible Docker builds.
- **Real mesh counting** — None outputs from PartCrafter decoding failures are replaced with 1-vertex dummy meshes. Part count validation counts only *real* meshes (>1 vertex).
- **VRAM budget logging** — After loading both SDXL Turbo (~2 GB) and PartCrafter (~4 GB), `main.py` logs allocated/total/free GPU memory.

</details>

<details>
<summary><strong>Changes</strong></summary>

| File | Changes |
|------|---------|
| `server/app/models/partcrafter.py` | **NEW** — `PartCrafterModel` wrapper implementing `ImageToPartsModel` protocol. BriaRMBG preprocessing, `@torch.inference_mode()`, OOM handling, structlog timing. |
| `server/app/services/pipeline.py` | Primary pipeline: SDXL Turbo → PartCrafter → `sample_from_part_meshes()`. Real-mesh filtering, per-step `perf_counter` timing, fallback to mock. Returns 4-tuple `(positions, part_ids, part_names, pipeline)`. |
| `server/app/main.py` | PartCrafter registration in `_load_models()` + VRAM budget logging after both models load. |
| `server/Dockerfile` | Vendored PartCrafter via `curl` tarball at pinned SHA. Added `PYTHONPATH` for `from src.*` imports. |
| `server/app/routes/debug.py` | `POST /debug/generate-mesh` — runs full pipeline, returns timing breakdown + part counts + vertex counts. |
| `server/pyproject.toml` | 10 inference-only deps: `einops`, `omegaconf`, `jaxtyping`, `typeguard`, `peft`, `colormaps`, `opencv-python`, `scikit-image`, `scikit-learn`, `huggingface-hub`. |
| `server/tests/test_partcrafter.py` | **NEW** — 32 tests across 8 classes: protocol, generation, None handling, point sampling, pipeline fallback, debug endpoint, encoding round-trips, registry, cache. |

</details>

<details>
<summary><strong>Verification</strong></summary>

- **152 tests pass** (32 new + 120 existing) — `uv run pytest tests/ -v` — 2.30s ✅
- **0 regressions** in existing test suite ✅
- **Runtime GPU smoke test pending** — needs Docker build + deploy to verify PartCrafter + SDXL Turbo coexist on L4 GPU

</details>

</details>
