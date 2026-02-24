# Lumen Pipeline — Cloud Run Deployment Checklist

Deploy backend (Cloud Run + L4 GPU) and frontend (GCS static hosting).

> [!IMPORTANT]
> **What changed:** `EAGER_LOAD_ALL=true` added to Cloud Run. All four models (SDXL Turbo, PartCrafter, Hunyuan3D Turbo, Grounded SAM 2) now load at startup. The VRAM offload safety net stays active at 18 GB threshold — if a fallback inference pushes VRAM past 18 GB, fallback models get offloaded to prevent OOM.

---

## Pre-Deploy Checklist

- [ ] All tests pass locally (`cd server && lets validate`)
- [ ] Changes committed and pushed to `infra/gce-gpu-vm` branch
- [ ] Branch merged to `main` (or deploy from branch)

---

## Deploy Backend

### Option A: One Command

```bash
cd server && lets release
```

This does:
1. `terraform apply` → picks up `EAGER_LOAD_ALL=true` env var
2. Cloud Build → builds Docker image → pushes to Artifact Registry
3. `gcloud run deploy` → deploys to Cloud Run with new image + env vars
4. Health check → confirms service is live

### Option B: Step by Step

```bash
# 1. Apply infra changes (adds EAGER_LOAD_ALL env var)
cd infrastructure/terraform
terraform plan    # Review — should show cloud_run env var change
terraform apply

# 2. Build and push image (if code changed)
gcloud builds submit server/ \
  --config=infrastructure/cloudbuild.yaml \
  --project=lumen-pipeline --region=us-east4

# 3. Deploy the new revision
gcloud run deploy lumen-pipeline \
  --image=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest \
  --project=lumen-pipeline --region=us-east4

# 4. Verify
SERVICE_URL=$(gcloud run services describe lumen-pipeline \
  --project=lumen-pipeline --region=us-east4 --format='value(status.url)')
curl -s "$SERVICE_URL/health/ready" | python3 -m json.tool
```

---

## Deploy Frontend

```bash
cd server && lets deploy-frontend
```

Or manually:

```bash
VITE_LUMEN_SERVER_URL=$(gcloud run services describe lumen-pipeline \
  --project=lumen-pipeline --region=us-east4 --format='value(status.url)') \
  npm run build

BUCKET=$(cd infrastructure/terraform && terraform output -raw frontend_bucket_name)
gcloud storage rsync dist/ "gs://$BUCKET" -r \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=300"
```

---

## Post-Deploy Verification

### 1. Check health — should show 4 models loaded

```bash
curl -s "$SERVICE_URL/health/ready" | python3 -m json.tool
```

Expected:
```json
{
  "status": "ready",
  "models_loaded": ["sdxl_turbo", "partcrafter", "hunyuan3d_turbo", "grounded_sam2"],
  "cache_connected": true
}
```

### 2. Check VRAM usage

```bash
curl -s -H "X-API-Key: <YOUR_KEY>" "$SERVICE_URL/health/detailed" | python3 -m json.tool
```

Look at `vram_allocated_gb` — should be ~17–18 GB with all 4 models loaded.

### 3. Test generation

```bash
curl -s -X POST "$SERVICE_URL/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <YOUR_KEY>" \
  -d '{"text": "a small red fox"}' | python3 -m json.tool
```

### 4. Watch logs for OOM

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="lumen-pipeline" AND (textPayload:"OOM" OR textPayload:"OutOfMemory" OR textPayload:"fallback_model_eager_load_failed")' \
  --project=lumen-pipeline --limit=20 --freshness=1h
```

---

## What Happens If It OOMs?

The design is **fail-safe**:

| Scenario | What Happens |
|---|---|
| **Fallback models fail to eager-load** | Primary models (SDXL Turbo + PartCrafter) work normally. Fallback stays lazy-loaded. Logged as `fallback_model_eager_load_failed`. |
| **VRAM > 18 GB after fallback inference** | Fallback models auto-offloaded. Next fallback request re-loads them (~20–40s). Logged as `vram_offload_triggered`. |
| **Total OOM crash** | Cloud Run auto-restarts the container. Primary models reload first, then fallback attempted again. |

## Rollback (If Needed)

Remove `EAGER_LOAD_ALL` from `cloud_run.tf` and re-deploy:

```bash
# In cloud_run.tf, remove:
#   env {
#     name  = "EAGER_LOAD_ALL"
#     value = "true"
#   }

cd infrastructure/terraform && terraform apply
gcloud run deploy lumen-pipeline \
  --image=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest \
  --project=lumen-pipeline --region=us-east4
```

---

## Quick Reference

| Component | Region | Deploy |
|---|---|---|
| Cloud Run (backend) | `us-east4` | `cd server && lets release` |
| Frontend (GCS) | `us-east4` | `cd server && lets deploy-frontend` |
| Both | — | `cd server && lets release-all` |

| Setting | Value | Purpose |
|---|---|---|
| `EAGER_LOAD_ALL` | `true` | Load all 4 models at startup |
| `VRAM_OFFLOAD_THRESHOLD_GB` | `18.0` (default) | Auto-offload fallback if VRAM > 18 GB |
| GPU | NVIDIA L4 (24 GB) | `us-east4` Cloud Run |
| Startup probe | 600s (60 × 10s) | Enough for 4 model loads |
