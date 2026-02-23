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
| 51 | Deploy Fix: torch-cluster + Client HTTP Integration (Prompt 06) | 2026-02-22 |
| 52 | MILESTONE: PartCrafter — Live 3D Mesh Generation Pipeline 🧩 | 2026-02-22 |
| 53 | S08: Cache Layer Hardening + Pre-Generation | 2026-02-22 |
| 54 | A1: Audio Pipeline Upgrades — Pitchy F0, Tiered STT, SER, AudioWorklet | 2026-02-22 |
| 55 | A2: Parametric Primitive Library + Shader Enhancements | 2026-02-22 |
| 56 | A3: Template System — 20 Motion Templates + JSON Schema | 2026-02-22 |
| 57 | S10: Fallback Pipeline — Hunyuan3D + Grounded SAM | 2026-02-22 |
| 58 | S14: Production Hardening — Metrics, Rate Limiting, Structured Logging | 2026-02-23 |
| 59 | A4: Tier 1 Lookup System — Sentence Parser, Verb Hash Table, NLP Sentiment | 2026-02-23 |
| 60 | Branch Merge Consolidation — All Branches into Main | 2026-02-23 |
| 61 | Repo Audit — Critical Build Fixes + Housekeeping | 2026-02-23 |

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

---

<details>
<summary><strong>51. Deploy Fix: torch-cluster + Client HTTP Integration (Prompt 06)</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Done</strong></summary>

Two distinct pieces of work in one session:

**A) Server Deploy Fix — PartCrafter `torch_cluster` dependency**
- PartCrafter model loading failed on Cloud Run due to missing `torch_cluster` (PyTorch Geometric extension)
- Added `torch-cluster` to `pyproject.toml` with `[tool.uv.extra-build-dependencies]` for build-time torch access
- Added `lets preflight` command — verifies all ML imports resolve on CPU before committing to a slow Cloud Build
- Added `.gcloudignore` — reduces Cloud Build upload from 1.8 GB to ~50 MB

**B) Client HTTP Integration (Prompt 06) — `ServerClient` + `ServerShapeAdapter`**
- **`ServerClient.ts`** — HTTP client with `AbortController` cancellation (latest-wins), 10s timeout, base64→Float32Array/Uint8Array decoding, `warmUp()` for Cloud Run cold start
- **`ServerShapeAdapter.ts`** — Expands 2,048 server points → 16,384 DataTexture pixels. First 2,048 are exact positions, remaining 14,336 use modular assignment with ±0.02 jitter
- **`ParticleSystem.setTargetTexture()`** — Accepts raw DataTexture (bypasses name-based MorphTargets lookup)
- **`MorphTargets.hasTarget()`** — Checks if local procedural shape exists
- **`SemanticBackend.ts`** — Server fallback: if `hasTarget()` is false and `ServerClient` is configured, fetches from server async, falls back to closest local shape on failure
- **`Canvas.tsx`** — Creates `ServerClient` singleton from `VITE_LUMEN_SERVER_URL`/`VITE_LUMEN_API_KEY` env vars, calls `warmUp()` on mount

</details>

<details>
<summary><strong>Changes</strong></summary>

| File | Changes |
|------|---------|
| `server/pyproject.toml` | Added `torch-cluster` + `[tool.uv.extra-build-dependencies]` |
| `server/lets.yaml` | Added `lets preflight` import verification command |
| `.gcloudignore` | **NEW** — Excludes `.venv`, `node_modules`, `.git` from Cloud Build |
| `src/services/ServerClient.ts` | **NEW** — HTTP client with abort, timeout, base64 decode |
| `src/engine/ServerShapeAdapter.ts` | **NEW** — 2048→16384 expansion + part ID textures |
| `src/engine/ParticleSystem.ts` | Added `setTargetTexture(tex, label)` |
| `src/engine/MorphTargets.ts` | Added `hasTarget(name)` |
| `src/services/SemanticBackend.ts` | Server fallback path + `requestServerShape()` |
| `src/components/Canvas.tsx` | ServerClient singleton + warmUp on mount |
| `.env.example` | **NEW** — Vite env vars for server URL and API key |
| `src/__tests__/ServerClient.test.ts` | **NEW** — 8 tests |
| `src/__tests__/ServerShapeAdapter.test.ts` | **NEW** — 8 tests |

</details>

<details>
<summary><strong>Verification</strong></summary>

- TypeScript compiles clean (`npx tsc --noEmit`) ✅
- **335 tests pass** (16 new + 319 existing), 0 regressions ✅
- `lets preflight` verifies all server ML imports locally on CPU ✅
- Commits: `609cba3` (torch-cluster + deploy), `94ef3bd` (client HTTP integration)

</details>

---

<details>
<summary><strong>52. A1: Audio Pipeline Upgrades — Pitchy F0, Tiered STT, SER, AudioWorklet</strong></summary>

**Date:** 2026-02-22
**Branch:** `client/a1-audio-pipeline`
**Commit:** `0960f63`

<details>
<summary><strong>What Was Done</strong></summary>

First task from the corrected Agent 2 Client Animation Pipeline spec. Enhanced the existing audio pipeline with four new capabilities:

1. **Pitchy F0 Pitch Extraction** — Added McLeod Pitch Method (via `pitchy`) to `AudioEngine.ts` using a parallel `AnalyserNode`. Computes fundamental frequency, speaker-relative deviation, and confidence. EMA baseline tracks the speaker's typical F0.

2. **Tiered STT Manager** — `stt-manager.ts` wraps the existing `SpeechEngine` and adds Moonshine STT as an async upgrade via `@huggingface/transformers`. Starts with Web Speech immediately, loads Moonshine in background, defers swap until the current utterance finalizes (`isFinal: true`) to avoid dropping words mid-sentence.

3. **SER Web Worker** — `ser-worker.ts` runs wav2vec2-base Speech Emotion Recognition in a dedicated Web Worker. Maps emotion classes to VAD (valence/arousal/dominance) via Russell's circumplex model.

4. **AudioWorklet + Audio Uniforms** — `audio-worklet.ts` captures raw PCM on the audio thread with dual ring buffers. `audio-uniforms.ts` packs all features into `Float32Array(16)` for GPU uniform upload.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `src/services/AudioEngine.ts` | **MODIFIED** — 3 new `AudioFeatures` fields, parallel `AnalyserNode`, `processPitch()`, EMA baseline |
| `src/audio/types.ts` | **NEW** — Shared interfaces: `PitchData`, `EmotionState`, `AudioUniformLayout`, `STTTier`, worker messages |
| `src/audio/stt-manager.ts` | **NEW** — Tiered STT wrapping `SpeechEngine` + async Moonshine upgrade |
| `src/audio/audio-worklet.ts` | **NEW** — AudioWorklet processor with dual ring buffers |
| `src/audio/ser-worker.ts` | **NEW** — Web Worker for wav2vec2-base emotion recognition |
| `src/audio/audio-uniforms.ts` | **NEW** — GPU uniform aggregator |
| `src/__tests__/AudioEngine.pitch.test.ts` | **NEW** — 6 tests |
| `src/__tests__/STTManager.test.ts` | **NEW** — 8 tests |
| `src/__tests__/AudioUniforms.test.ts` | **NEW** — 17 tests |
| `package.json` | Added `pitchy`, `@huggingface/transformers` |

</details>

<details>
<summary><strong>Verification</strong></summary>

- **69 tests pass** (38 original + 31 new), 0 regressions ✅
- All 23 original `AudioEngine.test.ts` tests unchanged and passing ✅
- All 15 original `SpeechEngine.test.ts` tests unchanged and passing ✅

</details>

</details>

</details>

---

<details>
<summary><strong>52. MILESTONE: PartCrafter — Live 3D Mesh Generation Pipeline 🧩</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Accomplished</strong></summary>

The Lumen server now has a **complete text-to-3D pipeline**: spoken word → SDXL Turbo reference image → BriaRMBG background removal → PartCrafter part-decomposed meshes → surface-sampled point cloud with semantic part IDs. This is the core ML pipeline that powers the entire visualization system.

PartCrafter (NeurIPS 2025) takes a single reference image and produces **multiple separate meshes**, each representing a semantic part of the object (e.g., legs, seat, back for a chair). This gives us labeled 3D geometry — not just a point cloud, but a point cloud where every point knows which part of the object it belongs to.

**Pipeline:** `text → SDXL Turbo (512×512 image, ~1s) → BriaRMBG (background removal) → PartCrafter (part meshes, ~30-60s) → point_sampler (2048 labeled points)`

</details>

<details>
<summary><strong>Reference Images — SDXL Turbo Stage (Live API)</strong></summary>

These reference images are generated by the live production API (`POST /debug/generate-image`) and feed into PartCrafter for 3D reconstruction. Each prompt uses `get_canonical_prompt()` to produce an optimal white-background reference:

| Concept | Reference Image |
|---------|-----------------|
| `chair` | ![Chair](milestones/m51_partcrafter_deploy/chair_ref.png) |
| `eagle` | ![Eagle](milestones/m51_partcrafter_deploy/eagle_ref.png) |
| `horse` | ![Horse](milestones/m51_partcrafter_deploy/horse_ref.png) |
| `butterfly` | ![Butterfly](milestones/m51_partcrafter_deploy/butterfly_ref.png) |
| `robot` | ![Robot](milestones/m51_partcrafter_deploy/robot_ref.png) |

</details>

<details>
<summary><strong>Architecture</strong></summary>

| Layer | Detail |
|-------|--------|
| **Models** | SDXL Turbo (~3 GB VRAM) + PartCrafter (~4 GB VRAM) = ~7 GB on L4 (24 GB) |
| **Preprocessing** | BriaRMBG background removal — SDXL images have backgrounds, PartCrafter expects white-bg |
| **Mesh Output** | N part meshes per concept (e.g., 4 parts for chair: legs, seat, back, arms) |
| **Point Sampling** | `sample_from_part_meshes()` — uniform surface sampling, 2048 points with part IDs |
| **Response Format** | Base64-encoded `Float32Array` positions + `Uint8Array` part IDs + part names JSON |
| **Vendoring** | PartCrafter tarball pinned to commit SHA `269bd41` for reproducible Docker builds |
| **Endpoint** | `POST /debug/generate-mesh` — returns timing breakdown + part counts + vertex counts |

</details>

<details>
<summary><strong>Pipeline Timing Analysis</strong></summary>

> ⚠️ **PartCrafter is currently loading on the latest deploy.** The model downloads ~4 GB of weights from Hugging Face on cold start. Once loaded, mesh generation timing data will be added here.
>
> **Expected latency per concept (based on model specs):**

| Stage | Expected Latency |
|-------|------------------|
| SDXL Turbo (512×512, 1-step) | ~0.5–1.0s |
| BriaRMBG (background removal) | ~0.2–0.5s |
| PartCrafter (image → part meshes) | ~30–60s |
| Point sampling (2048 pts) | ~5–10ms |
| **Total** | **~31–62s** |

PartCrafter dominates latency. The cache layer (entry #53) mitigates this for repeated concepts. The pre-generation script warms the top 50 concepts at deploy time.

</details>

<details>
<summary><strong>Deploy Status</strong></summary>

- SDXL Turbo: **loaded and serving** ✅
- PartCrafter: **loading on deploy** (downloading weights from Hugging Face) ⏳
- `/health/ready` shows `["sdxl_turbo"]` — PartCrafter loads in background thread after SDXL Turbo
- Cache connected: ✅
- 5 reference images generated via live API confirming SDXL Turbo stage works end-to-end ✅
- 152 tests pass (32 PartCrafter + 120 existing), 0 regressions ✅

</details>

<details>
<summary><strong>Key Design Decisions</strong></summary>

- **Vendored PartCrafter** — Not pip-installable; downloaded as a tarball pinned to commit SHA for reproducible Docker builds. Added to `PYTHONPATH` for `from src.*` imports.
- **BriaRMBG as separate timed step** — SDXL Turbo images have backgrounds; PartCrafter expects white-bg. Background removal timing is logged independently.
- **Real mesh counting** — None outputs from PartCrafter decoding failures are replaced with 1-vertex dummy meshes. Part count validation counts only real meshes (>1 vertex).
- **Sequential model loading** — SDXL Turbo loads first (lighter, faster), then PartCrafter. Server serves SDXL-only requests while PartCrafter loads in background.
- **torch-cluster dependency** — Required by PartCrafter for point cloud operations. Added to `pyproject.toml` with build-time torch access via `[tool.uv.extra-build-dependencies]`.

</details>

</details>

---

<details>
<summary><strong>53. S08: Cache Layer Hardening + Pre-Generation</strong></summary>

**Date:** 2026-02-22
**Branch:** `server/s08-cache`
**Commit:** `a7ee743`

<details>
<summary><strong>What Was Done</strong></summary>

Hardened the server-side `ShapeCache` and added infrastructure for pre-generation of common shapes:

1. **Thread-Safe LRU** — Added `threading.Lock` around `cachetools.LRUCache` reads/writes for safe concurrent access when Cloud Run concurrency > 1.

2. **Thundering Herd Prevention** — Per-key coalescing via `_in_flight: dict[str, asyncio.Event]`. Concurrent requests for the same uncached key await the result instead of issuing duplicate reads/generation.

3. **Cache Warming** — `load_all_cached()` loads all pre-generated shapes from Cloud Storage into memory LRU on startup. 50 × ~27KB ≈ 1.3MB, LRU evicts naturally.

4. **Pre-Generation Script** — `scripts/pregenerate_top_50.py` is a post-deploy step that polls `/health/ready` before generating 50 common shapes. Idempotent — skips cached concepts.

5. **Stats Endpoint** — `GET /cache/stats` returns memory/storage sizes, hit counts, hit rate, and average retrieval times per tier.

6. **Collision Logging** — Detects when two different texts normalize to the same hash key.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `server/app/cache/shape_cache.py` | **MODIFIED** — Threading lock, coalescing, timing stats, `load_all_cached()`, `count_stored_shapes()`, collision tracking |
| `server/app/routes/cache.py` | **NEW** — `GET /cache/stats` endpoint |
| `server/app/main.py` | **MODIFIED** — Cache warming after model load, registered cache route |
| `server/scripts/pregenerate_top_50.py` | **NEW** — Post-deploy script with health poll, progress logging |
| `server/tests/test_shape_cache.py` | **NEW** — 24 tests |

</details>

<details>
<summary><strong>Verification</strong></summary>

- **176 server tests pass** (24 new + 152 existing), 0 regressions ✅

</details>

</details>

<details>
<summary><strong>54. A2: Parametric Primitive Library + Shader Enhancements</strong></summary>

> **Date:** 2026-02-22 · **Branch:** `client/a2-primitives-shader`

<details>
<summary><strong>What Was Done</strong></summary>

Implemented the complete A2 task from the Client Animation Pipeline spec. This adds a parametric motion system to the existing particle physics — 15 GLSL motion primitives that compute displacement vectors, fed into the existing spring-damper system for natural overshoot and settle.

**Key design decisions:**
- **Displacement into existing spring** — primitives modify the spring target (`targetPos = restPos + displacement`), not velocity directly. The existing spring-damper provides free overshoot/settle/follow-through.
- **Data textures, not uniform arrays** — motion plan params are stored in a 4×33 RGBA Float32 DataTexture. Avoids the vec4 slot explosion (`uniform float arr[N]` = 1 vec4 slot/element) and GLSL ES dynamically-uniform indexing constraint.
- **attachmentWeight** — `tPartAttr` texture: R=partId (integer-valued float), G=attachmentWeight (0.0=joint, 1.0=extremity). Scales displacement for organic bends, not rigid block motion.
- **One-shot vs looping lifecycle** — the *shader* handles duration. One-shots (`arc_translate`, `spring_settle`, `radial_burst`, `radial_contract`, `brownian_scatter`) compute `t = clamp((uTime - startTime) / duration, 0, 1)` and hold final displacement at `t=1`. Loopers (`duration=0`) use raw time. The template system just sets `startTime` + `duration` — no polling needed.
- **Crossfade double-buffer** — `tMotionPlanB` + `uBlendFactor` for smooth transitions. At `blendFactor=1.0`: copies plan B texture data → plan A, resets blend to 0. No visual pop because output is already 100% plan B at that moment.
- **`#ifdef MOTION_PLAN_ENABLED`** — `buildMotionPlanShader()` prepends `primitives.glsl` + `motion-plan.glsl` and adds `#define MOTION_PLAN_ENABLED`. If the prepend is removed, the velocity shader compiles and runs identically to pre-A2.
- **Cascaded dispatch** — instead of a 15-way `switch` (which GLSL compilers flatten on mobile/Intel GPUs), uses nested 4-way `if/else` blocks. With ≤8 active primitives per frame, most particles share the same branch → minimal divergence.

**Texture packing layout** — `tMotionPlan` is 4 texels × 33 rows. Each row = 16 floats:

| Texel | Channels |
|-------|----------|
| 0 | `primitiveId, phase, startTime, duration` |
| 1 | `p0, p1, p2, p3` |
| 2 | `p4, p5, p6, p7` |
| 3 | `p8, p9, p10, p11` |

Row 0 = whole-body; rows 1–32 = per-part. Inactive parts: `primitiveId = -1`. Part ID 0 = unassigned (whole-body only).

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `src/shaders/primitives.glsl` | **NEW** — 15 GLSL motion primitives + 3 modifiers + cascaded 4-way dispatch |
| `src/shaders/motion-plan.glsl` | **NEW** — Data texture read/dispatch, whole-body + per-part evaluation, crossfade |
| `src/shaders/velocity.frag.glsl` | **MODIFIED** — `#ifdef MOTION_PLAN_ENABLED` guarded motion plan path + pitch stiffness |
| `src/renderer/types.ts` | **NEW** — `MotionPlanData`, `PartMotionData` interfaces, primitive ID constants (0–14) |
| `src/engine/particle-system-extensions.ts` | **NEW** — `MotionPlanManager`: texture packing, crossfade, `buildMotionPlanShader()` |
| `src/engine/ParticleSystem.ts` | **MODIFIED** — Enhanced velocity shader, added `getVelocityUniforms()` |
| `src/test/primitive-test.html` | **NEW** — Standalone test harness (GPUComputationRenderer, 6-part mock quadruped, sliders) |
| `src/__tests__/MotionPlanManager.test.ts` | **NEW** — 20 tests |

</details>

<details>
<summary><strong>Verification</strong></summary>

- **89 tests pass** (20 new + 69 existing from A1), 0 regressions ✅

**Test coverage:** plan activation + uniform sync (3), texture packing layout verification (2), crossfade at t=0/0.5/1.0 including B→A swap (3), `clearMotionPlan()` restore (1), part attribute texture R/G layout (1), types/constants/one-shot classification (4), `buildMotionPlanShader()` concatenation (3), construction defaults (2).

</details>

</details>

---

<details>
<summary><strong>56. A3: Template System — 20 Motion Templates + JSON Schema</strong></summary>

**Date:** 2026-02-22
**Branch:** `client/a3-template-system`
**Commit:** `6ed6629`

<details>
<summary><strong>What Was Done</strong></summary>

Designed and implemented a JSON-driven template system for the A2 parametric motion primitives. Templates define reusable animation behaviors ("gallop", "fly", "sway") as composable JSON objects that map to the 15 GLSL primitives.

1. **Template JSON Schema** — `template-types.ts` defines the `TemplateJSON` interface with anchor verbs, whole-body motion, per-part glob-matched rules, and defaults.
2. **Template Library** — `template-library.ts` loads, validates, and indexes templates. Build-time validation checks primitive names and glob patterns. Verb→template mapping with collision warnings.
3. **Glob Matcher** — `glob-matcher.ts` matches part names (e.g., `*leg*`, `head`) to motion rules.
4. **20 Initial Templates** — Covering animals (gallop, fly, slither), humans (walk, dance), objects (spin, bounce), nature (sway, grow), and abstract motions.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `src/templates/template-types.ts` | **NEW** — `TemplateJSON` interface + schema types |
| `src/templates/template-library.ts` | **NEW** — Load, validate, index templates |
| `src/templates/glob-matcher.ts` | **NEW** — Part name glob matching |
| `src/templates/*.json` | **NEW** — 20 template JSON files |
| `src/__tests__/A3-TemplateSystem.test.ts` | **NEW** — Template validation + library tests |

</details>

</details>

---

<details>
<summary><strong>57. S10: Fallback Pipeline — Hunyuan3D + Grounded SAM</strong></summary>

**Date:** 2026-02-22
**Branch:** `server/s10-fallback`
**Commit:** `cadfbc2`

<details>
<summary><strong>What Was Done</strong></summary>

Added an alternative 3D generation pipeline using Hunyuan3D and Grounded SAM for cases where PartCrafter fails or produces low-quality results. Includes multi-view rendering, mask mapping, and VRAM offload management for running multiple large models on a single L4 GPU.

</details>

</details>

---

<details>
<summary><strong>58. S14: Production Hardening — Metrics, Rate Limiting, Structured Logging</strong></summary>

**Date:** 2026-02-23
**Branch:** `server/s14-production-hardening`
**Commits:** `ee2c950`, `3dd6ee1`

<details>
<summary><strong>What Was Done</strong></summary>

1. **Metrics Service** — `metrics.py` tracks pipeline latency percentiles, cache hit rates, model load times, and error counts.
2. **Enhanced Health Checks** — `/health/detailed` returns model status, cache health, and system metrics. `/metrics` exposes pipeline performance data.
3. **Differentiated Rate Limiting** — Two-tier system: outer rate limit (300/min on `/generate`) for real-time speech bursts, inner limit in pipeline for GPU protection.
4. **`Retry-After` Header** — `GenerationRateLimitError` returns `retry_after_seconds` in the response for client backoff.
5. **Structured Logging** — `structlog` configuration with JSON renderer for Cloud Logging integration.
6. **Integration Tests** — `test_integration.py` covers the full request lifecycle.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `server/app/services/metrics.py` | **NEW** — Pipeline metrics service |
| `server/app/main.py` | **MODIFIED** — Metrics in lifespan + `/metrics` route |
| `server/app/services/pipeline.py` | **MODIFIED** — Two-tier rate limiting, metrics integration |
| `server/app/exceptions.py` | **MODIFIED** — `GenerationRateLimitError` with `retry_after_seconds` |
| `server/app/routes/generate.py` | **MODIFIED** — 300/min outer rate limit |
| `server/tests/test_integration.py` | **NEW** — Integration test suite |

</details>

</details>

---

<details>
<summary><strong>59. A4: Tier 1 Lookup System — Sentence Parser, Verb Hash Table, NLP Sentiment</strong></summary>

**Date:** 2026-02-23
**Branch:** `client/a4-tier1-lookup`
**Commit:** `5f7a95d`

<details>
<summary><strong>What Was Done</strong></summary>

1. **Sentence Parser** — NLP sentence splitting using Compromise for extracting verbs, nouns, and adverbs from transcribed speech.
2. **Verb Hash Table** — 393 verb entries with hand-rolled conjugation covering 90+ irregular verbs. Maps verbs to template IDs for instant motion lookup.
3. **MiniLM Embedding Fallback** — Returns null without real anchors (placeholder for future semantic similarity matching).
4. **Adverb Resolver** — Maps adverbs to speed/amplitude modifiers for motion templates.
5. **Tier 1 Orchestrator** — Coordinates sentence parsing → verb lookup → template resolution → motion plan activation.
6. **NLP Sentiment** — Fills `textSentiment` uniform slot [7] for shader color modulation.
7. **Session Logger** — `SessionLogger` event types + `VITE_MOTION_SERVER_URL` env var support.

</details>

<details>
<summary><strong>Verification</strong></summary>

- **25 test files, 495 tests, 0 regressions** ✅
- 68 new tests across: VerbHashTable, AdverbResolver, SentenceParser, Tier1Orchestrator, GhostTranscript, Sentiment

</details>

</details>

---

<details>
<summary><strong>60. Branch Merge Consolidation — All Branches into Main</strong></summary>

**Date:** 2026-02-23

<details>
<summary><strong>What Was Done</strong></summary>

Merged all 7 feature branches into `main` in dependency order:

1. `server/s10-fallback` → main
2. `client/a2-primitives-shader` → main
3. `client/a3-template-system` → main
4. `server/s14-production-hardening` → main
5. `analysis/server-pipeline-progress` → main (server fixes + cloudbuild timeout)
6. `client/a4-tier1-lookup` → main

Conflicts resolved in merge commits. Main branch now reflects the complete state of all work streams.

</details>

</details>

---

<details>
<summary><strong>61. Repo Audit — Critical Build Fixes + Housekeeping</strong></summary>

**Date:** 2026-02-23
**Commits:** `2ae4f63`, `b5647ea`, `40ff2a0`, `16ce320`

<details>
<summary><strong>What Was Done</strong></summary>

Comprehensive repo audit identifying 38 items across 5 priority tiers. Executed all 3 Critical fixes that were blocking production builds:

**C1: TypeScript Compilation (27 → 0 errors)**
- Updated Vitest config reference for v4 (`vite.config.ts`)
- Added missing `pitch` fields to `AudioFeatures` test factories
- Fixed unused variables/imports across 6 test files
- Created `audio-worklet.d.ts` ambient type declarations
- Excluded `audio-worklet.ts` from main tsconfig (separate JS scope)

**C2: ESLint Crash**
- Removed `ajv` override from `package.json` that broke `@eslint/eslintrc`

**C3: `.gitignore` Formatting Bug**
- Split concatenated patterns on line 60 (`crash.log` + `*.tfplan`)

**Housekeeping:**
- Removed internal docs from git tracking (agent workflows, planning, analysis)
- Added `*.xlsx` to `.gitignore`
- Expanded `.gcloudignore` to exclude frontend, docs, media, and data files from Cloud Build uploads

</details>

<details>
<summary><strong>Verification</strong></summary>

| Check | Before | After |
|-------|--------|-------|
| `tsc -b --noEmit` | ❌ ~27 errors | ✅ 0 errors |
| `npx eslint .` | ❌ Crash | ✅ Runs (125 pre-existing warnings) |
| `npx vitest run` | ✅ 495 pass | ✅ 495 pass |
| `npm run build` | ❌ Fails | ✅ 852KB production bundle |

14 files changed across the codebase.

</details>

</details>

---

<details>
<summary><strong>62. WS1: Server Pipeline Hardening — S08a/S08b/S10a/S10b/S14a/S14b</strong></summary>

**Date:** 2026-02-23
**Branch:** `server/ws1-pipeline-hardening`
**Commit:** `01160bf`

<details>
<summary><strong>What Was Done</strong></summary>

Six server pipeline tasks implemented in a single branch:

1. **S08a: Cache Key Lemmatization** — Replaced basic normalization with NLTK `WordNetLemmatizer`. "horses"/"horse", "dragons"/"dragon" now hit the same cache key. Adjectives preserved ("red dragon" ≠ "blue dragon"). Added `nltk>=3.9` dependency.

2. **S08b: Thread Safety + Startup Warming** — Added `asyncio.Lock` around `_in_flight` dict access to prevent TOCTOU race conditions in thundering-herd prevention. Added top-8 concept preloading ("horse", "dog", "cat", "bird", "dragon", "elephant", "fish", "car") on startup.

3. **S10a: Fallback Pipeline Validation** — Made VRAM offload threshold configurable via `vram_offload_threshold_gb` setting (default 18.0 GB). Created GPU-skippable fallback validation test suite.

4. **S10b: Point Sampler Hardening** — Added degenerate triangle guard in `sample_from_labeled_mesh()` — if `trimesh.sample.sample_surface()` returns fewer points than requested (zero-area faces), pads with repeated samples to hit exact target count.

5. **S14a: Prometheus + OpenTelemetry** — Created `/metrics/prometheus` endpoint with Prometheus text exposition format (cache hit ratio, GPU memory, model load status gauges). Added OpenTelemetry tracing spans to pipeline (`generate`, `cache_lookup`, `cache_write`). Supports `console` and `gcp` exporters; no-op when unconfigured.

6. **S14b: Integration Test Expansion** — Expanded from ~10 to 15 tests covering: happy path with full payload validation, cache hit/miss/write, health endpoints (liveness/readiness/detailed), metrics schema, Prometheus endpoint, validation errors (empty/long/missing/numeric text), CORS headers.

**Also fixed:** Pre-existing `torch>=2.10` version constraint (parsed as 2.10.0, no such version) → `torch>=2.7,<2.8` to match `torchvision>=0.22,<0.23`.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `server/app/cache/shape_cache.py` | Lemmatizer + `asyncio.Lock` on `_in_flight` |
| `server/app/config.py` | `vram_offload_threshold_gb` setting |
| `server/app/main.py` | OTel config, prometheus route, top-8 preloading |
| `server/app/pipeline/point_sampler.py` | Degenerate triangle guard |
| `server/app/routes/prometheus.py` | **NEW** — Prometheus metrics endpoint |
| `server/app/services/pipeline.py` | OTel tracing spans + configurable VRAM threshold |
| `server/pyproject.toml` | nltk, prometheus-client, opentelemetry-* deps + torch fix |
| `server/tests/test_fallback_validation.py` | **NEW** — GPU-skippable fallback tests |
| `server/tests/test_integration.py` | Expanded to 15 tests |
| `server/tests/test_point_sampler.py` | 5 edge-case tests |
| `server/tests/test_shape_cache.py` | 5 lemmatization tests |
| `server/uv.lock` | Updated lockfile |

</details>

<details>
<summary><strong>Verification</strong></summary>

- **230 tests pass, 3 skipped** (GPU-only), 0 regressions ✅
- New dependencies resolved: opentelemetry-api 1.39.1, prometheus-client 0.24.1, nltk ✅
- Torch pinned to 2.7.1 matching torchvision 0.22.1 ✅

</details>

</details>
