# 05a Shape Pipeline Quality — Analysis Report

**Generated:** 2026-02-23 17:10 PST
**Service:** `https://lumen-pipeline-gldbd4c4ka-uk.a.run.app`

---

## ⛔ Critical Finding: Generation Pipeline is Broken

**All `/generate` requests return HTTP 500.** The shape generation pipeline has **never produced a successful result** on this deployment.

### Error

```
{
  "error": "Generation failed for '<concept>': stat: path should be string, bytes, os.PathLike or integer, not Image",
  "type": "GenerationFailedError"
}
```

### Root Cause

The bug is in `PartCrafterModel.generate()` → `prepare_image()`:

```python
# app/models/partcrafter.py, line 151
from src.utils.image_utils import prepare_image

processed_image = prepare_image(
    image,                            # ← PIL.Image.Image
    bg_color=np.array([1.0, 1.0, 1.0]),
    rmbg_net=self._rmbg,
)
```

The `prepare_image()` function (from the PartCrafter pip package `src.utils.image_utils`) internally calls `os.stat()` on its first argument, expecting a **file path string**. But the code passes a **PIL.Image.Image** object (the SDXL Turbo output).

### Impact

- **100% failure rate** — no shapes have ever been generated on production
- **293 misses, 0 cache entries** — cache has never been populated
- **Frontend gets no data** — every user interaction results in an error

---

## Service Health (Live Data)

| Metric | Value |
|--------|-------|
| Status | `healthy` ✅ |
| Models loaded | `sdxl_turbo`, `partcrafter` |
| Fallback loaded | `false` |
| GPU | NVIDIA L4 |
| GPU memory used | 11.2 / 23.6 GB (47%) |
| Cache connected | `true` |
| Cache memory size | 0 |
| Cache storage size | 0 |
| Cache misses | 293 |
| Cache hit rate | 0.0% |
| Uptime | ~57 min |

### Key observations

1. **Both models loaded successfully** — SDXL Turbo (3GB) and PartCrafter (4GB) are in VRAM, using ~11.2GB total
2. **Fallback pipeline not loaded** — `hunyuan3d_grounded_sam` is not available
3. **GPU has headroom** — 12.4GB free VRAM, enough for either model to run inference
4. **Cache is empty** — 0 entries in both memory and GCS, 293 zero misses (i.e. 293 failed generation attempts)

---

## What We Cannot Test (Blocked)

Because generation is broken, these 05a analyses are blocked:

| Analysis | Status | Blocked By |
|----------|--------|------------|
| Batch generation (50 concepts) | ❌ Blocked | `prepare_image` bug |
| Geometry quality (NaN, OOB, parts) | ❌ Blocked | No generated data |
| Pipeline comparison (PartCrafter vs fallback) | ❌ Blocked | No data, fallback also not loaded |
| Prompt sensitivity (quality levels) | ❌ Blocked | No data |

---

## Fix Required

The `prepare_image()` function in the PartCrafter library expects a file path. The fix in `app/models/partcrafter.py` is to **save the PIL image to a temp file** before calling `prepare_image`, or **look at the PartCrafter library version** to see if a newer version accepts PIL Image directly.

### Option A: Temp file workaround

```python
import tempfile

# Save PIL image to temp file for prepare_image
with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
    image.save(tmp, format="PNG")
    tmp_path = tmp.name

processed_image = prepare_image(
    tmp_path,  # ← file path, not PIL Image
    bg_color=np.array([1.0, 1.0, 1.0]),
    rmbg_net=self._rmbg,
)

import os
os.unlink(tmp_path)
```

### Option B: Check `prepare_image` signature

```bash
# On the deployed container or locally with PartCrafter installed:
python3 -c "from src.utils.image_utils import prepare_image; help(prepare_image)"
```

If the function signature shows `image_path: str`, Option A is the correct fix.

---

## Next Steps

1. **Fix the `prepare_image` call** in `partcrafter.py` (Priority: P0 — nothing works without this)
2. **Redeploy** to Cloud Run
3. **Re-run this 05a analysis** against the fixed deployment
4. Verify the fallback pipeline loading behavior — currently it never activates because PartCrafter "loads" successfully but fails at inference time

---

## Appendix: Live Verification Commands Used

```bash
# Health check
curl -s -H "X-API-Key: $KEY" "$URL/health/ready"
# → {"status":"ready","models_loaded":["sdxl_turbo","partcrafter"],"cache_connected":true}

# Detailed health
curl -s -H "X-API-Key: $KEY" "$URL/health/detailed"
# → GPU: 11.2/23.6GB, uptime: 3437s, 293 cache misses

# Generation (all fail)
curl -s -X POST -H "X-API-Key: $KEY" "$URL/generate?text=dog"
# → {"error":"Generation failed for 'dog': stat: path should be...","type":"GenerationFailedError"}

curl -s -X POST -H "X-API-Key: $KEY" "$URL/generate?text=dragon"
# → same error

curl -s -X POST -H "X-API-Key: $KEY" "$URL/generate?text=horse&quality=fast"
# → same error
```
