# Lumen Pipeline — Improvement Backlog

**Consolidated from:** `04-skipped-tests-analysis`, `04a-test-coverage-gaps`, `04b-pipeline-improvements`, `04c-production-hardening`
**Date:** 2026-02-23

---

## 1. Pipeline Resilience (from 04b)

| ID | Issue | Severity | Risk | Effort | Notes |
|----|-------|----------|------|--------|-------|
| A1 | No per-model timeouts | **P0** | Silent hangs (PartCrafter 60s+) | 2h | Global 15s timeout exists but individual models unprotected |
| A2 | VRAM not freed after fallback | **P0** | OOM cascade on 2nd request | 1h | Threshold-based offload at 18/24GB is reactive, not proactive |
| A3 | Concurrent requests share GPU | **P0** | CUDA race conditions | 4h | Fix: `asyncio.Semaphore(1)` around GPU work |
| A4 | Fallback models lazy-load on critical path | P1 | 60s+ startup for first fallback | 3h | Eager background load after primary models |
| A5 | No retry on transient GPU errors | P1 | 1–2% of requests fail permanently | 2h | Add 3-attempt retry with backoff (not for OOM) |
| A6 | Mesh validation insufficient | P1 | Invalid data reaches frontend | 1h | Only checks vertex count; no NaN/bounds/face checks |
| A7 | Cache write not resilient | P1 | 500 error despite successful generation | 1h | Make cache write non-blocking and non-fatal |

### Performance Bottlenecks

| ID | Issue | Severity | Effort | Notes |
|----|-------|----------|--------|-------|
| B1 | Latency overhead unquantified | P1 | 2h | No per-stage timing breakdown |
| B2 | No request queue under load | P1 | 3h | Timeout cascade during traffic spikes |
| B3 | Point cloud buffer allocation | P2 | 2h | ~100ms overhead per request |
| B4 | Models not pre-warmed | P2 | 1h | 1–2s cold inference penalty on first call |

---

## 2. Security Hardening (from 04c)

| Issue | Severity | Status | Action |
|-------|----------|--------|--------|
| Debug routes enabled in production | **P0** | ❌ `enable_debug_routes` defaults `True` | Set `ENABLE_DEBUG_ROUTES=false` in Cloud Run env |
| CORS overly permissive | P1 | ❌ Defaults to `*` (all origins) | Set `ALLOWED_ORIGINS` to production domain |
| API key rotation — no strategy | P1 | Missing | Implement key versioning, 30-day expiry |
| No request/response body logging | P1 | Missing | Log truncated request body for `/generate` |

---

## 3. Cache & Storage (from 04c)

| Issue | Severity | Status | Action |
|-------|----------|--------|--------|
| No cache TTL | P1 | ❌ Entries live forever in GCS | Add 90-day TTL via blob metadata |
| No GCS eviction policy | P1 | ❌ Unbounded bucket growth | Counter blob + LRU eviction at 5K shapes |
| Cache key fuzzy matching | P2 | Missing | Levenshtein fallback for near-miss typos |
| Rate limit state lost on restart | P1 | ❌ In-memory only | Consider Redis for distributed state |
| Rate limit missing `Retry-After` header | P1 | ❌ slowapi doesn't set it | Add header to 429 responses |

---

## 4. Observability (from 04c)

| Issue | Severity | Status | Action |
|-------|----------|--------|--------|
| No distributed tracing spans | **P0** | ❌ OTEL configured but no spans created | Add spans to routes, cache, pipeline |
| Sparse error context | P1 | ❌ No error-type breakdown in metrics | Track `errors_by_type` and `errors_by_route` |
| No startup time histogram | P2 | Missing | Log `model_load_duration_ms` per model |

---

## 5. Test Coverage Gaps (from 04a)

| ID | Gap | Risk | Effort | Impact |
|----|-----|------|--------|--------|
| G1 | Response schema contract (frontend↔backend) | **HIGH** | 3–4h | Prevents silent frontend failures from schema drift |
| G2 | Auth & CORS error paths | **HIGH** | 2–3h | CORS preflight, header case-sensitivity, timing attacks |
| G3 | Rate limiting stress test | **HIGH** | 4–6h | No test verifies 301st request returns 429 |
| G4 | ServerClient malformed response handling | **HIGH** | 2–3h | No distinction between rate-limit / timeout / network error |
| G5 | Pipeline timeout + GPU OOM recovery | MEDIUM | 4–5h | Does background thread get cancelled on timeout? |
| G6 | Cache concurrency & thundering herd | MEDIUM | 3–4h | Existing `_in_flight` mechanism untested |
| G7 | TuningPanel state sync | MEDIUM | 2–3h | No frontend component tests at all |
| G8 | Health probe degradation scenarios | MEDIUM | 2–3h | What if cache disconnects mid-operation? |
| G9 | Middleware request context leaks | LOW | 2–3h | Request ID propagation untested |
| G10 | Debug endpoints model availability | LOW | 1–2h | Edge cases when models partially loaded |

---

## 6. Skipped/Mocked Tests (from 04)

### GPU-Only Tests (skip in CI, run on GPU hardware)

| Test Class | File | What It Tests | Priority |
|------------|------|---------------|----------|
| `TestHunyuan3DGeneration` | `test_fallback_validation.py` | Actual Hunyuan3D mesh generation | HIGH |
| `TestGroundedSAMSegmentation` | `test_fallback_validation.py` | Grounded SAM 2 part segmentation | HIGH |
| `TestVRAMBudget` | `test_fallback_validation.py` | All models fit within 20GB VRAM | MEDIUM |

### Model Mocking Summary

All 200+ tests use `skip_model_load=True`. Key models mocked:

| Model | Size | VRAM | Tests Affected |
|-------|------|------|----------------|
| SDXL Turbo | 3GB | 3GB | `test_sdxl_turbo.py` (10), `test_integration.py` (13) |
| PartCrafter | 2GB | 4GB | `test_partcrafter.py` (30+), `test_pipeline.py` (8) |
| Hunyuan3D-2 Turbo | 3GB | 6GB | `test_hunyuan3d.py` (8), `test_fallback_*.py` (4) |
| Grounded SAM 2 | 2GB | 4.5GB | `test_grounded_sam.py` (5) |

### Post-Deployment Verification Order

1. **Deploy Day:** Run endpoint tests (`01-03` docs), then reliability test from `05c` (100 concepts, ~10 min)
2. **First Week:** Shape quality analysis (`05a`), 5 UX sessions (`05b`), cache analysis (`05c`)
3. **Ongoing:** Address P0s from this backlog, fill test coverage gaps, re-run stress test monthly

---

## Priority Summary

### Must-Fix Before Production (P0)

1. **A1** — Per-model timeouts
2. **A2** — VRAM cleanup after fallback
3. **A3** — GPU semaphore for concurrent requests
4. **Security** — Disable debug routes, fix CORS
5. **Observability** — Add distributed tracing spans

### Should-Fix First Week (P1)

- A4–A7 pipeline improvements
- Cache TTL + eviction
- Rate limit `Retry-After` header
- Test gaps G1–G4
- Error context in metrics

### Nice-to-Have (P2)

- B3–B4 performance tuning
- Cache fuzzy matching
- Startup histograms
- Test gaps G5–G10
