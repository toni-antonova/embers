# Lumen Deployment Guide — Step by Step

> Everything below uses your actual `lets.yaml` commands and Terraform config.
> Run all commands from the repo root unless noted otherwise.

---

## Prerequisites (one-time setup)

Before anything else, make sure these are installed on your machine:

```bash
# Check each is available
gcloud --version          # Google Cloud SDK
terraform --version       # >= 1.5.0
node --version            # Node 22+ (for frontend build)
uv --version              # Python package manager (backend)
lets --version             # Task runner (wraps gcloud/terraform commands)
```

If `lets` isn't installed: `brew install lets` (macOS) or see [lets docs](https://lets-cli.org).

Authenticate with GCP:

```bash
gcloud auth login
gcloud auth application-default login    # Terraform needs this too
gcloud config set project lumen-pipeline
```

---

## Phase 1: Terraform — Provision Infrastructure

This creates all GCP resources: Artifact Registry, Cloud Storage buckets, Secret Manager secrets, Cloud Run service definition, IAM bindings.

### 1.1 Create the Terraform state bucket (first time only)

```bash
gsutil mb -l us-east4 gs://lumen-terraform-state
```

### 1.2 Create `terraform.tfvars` (minimal — no secrets needed)

```bash
cat > infrastructure/terraform/terraform.tfvars << 'EOF'
project_id      = "lumen-pipeline"
region          = "us-east4"
allowed_origins = "http://localhost:5173"
alert_email     = "toniiantonova@gmail.com"
EOF
```

Secrets (`api_key`, `hf_token`) default to placeholders. Terraform creates the Secret Manager entries, then you populate the real values via `gcloud` in step 1.4.

### 1.3 Initialize and apply

```bash
cd infrastructure/terraform
terraform init        # Downloads providers, connects to state bucket
terraform plan        # Review what will be created — read this carefully!
```

**What you'll see:** ~12 resources to create (Artifact Registry repo, 2 Storage buckets, Cloud Run service, service account, 4 IAM bindings, 2 secrets, API enablements).

**Expected issue:** The Cloud Run service will be created with a placeholder image that doesn't exist yet. That's fine — it will fail to deploy a revision, but the service *definition* is created. We'll push a real image next.

```bash
terraform apply       # Type "yes" to confirm
```

> **Save the outputs!** Terraform prints `cloud_run_url`, `frontend_url`, etc. You'll need the Cloud Run URL later.

```bash
terraform output      # Print them again anytime
```

### 1.4 Populate secrets (after terraform apply)

Terraform created the Secret Manager entries with placeholder values. Now set the real ones:

```bash
# Generate and set a random API key
openssl rand -hex 32 | gcloud secrets versions add lumen-api-key --data-file=- --project=lumen-pipeline

# Set your HuggingFace token (get one at https://huggingface.co/settings/tokens, read scope)
gcloud secrets versions add lumen-hf-token --data-file=- --project=lumen-pipeline <<< "hf_YOUR_TOKEN_HERE"
```

Verify both are set:

```bash
gcloud secrets versions list lumen-api-key --project=lumen-pipeline
gcloud secrets versions list lumen-hf-token --project=lumen-pipeline
```

Both should show version `2` (the real value) with state `ENABLED`.

---

## Phase 2: Build the Base Docker Image

The base image has all ML dependencies (~2GB of PyTorch/CUDA wheels + PartCrafter). This takes 20–40 minutes the first time but only needs rebuilding when `pyproject.toml` changes.

### 2.1 Build and push

```bash
cd server
lets build-base
```

This runs `cloudbuild-base.yaml` on Cloud Build. Watch it in the terminal or at https://console.cloud.google.com/cloud-build/builds?project=lumen-pipeline

### 2.2 Verify the base image exists

```bash
gcloud artifacts docker images list \
  us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker \
  --filter="package=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-base" \
  --limit=3
```

You should see `lumen-base:latest`.

**Likely issues:**
- **PartCrafter download fails:** The SHA in `Dockerfile.base` points to a specific GitHub commit. If the repo is private or moved, the `curl` will fail. Check the build logs.
- **Disk space:** The E2_HIGHCPU_8 Cloud Build machine has 100GB — should be fine, but if you see disk errors, check if torch wheel caching is filling up.

---

## Phase 3: Build & Deploy the Backend

### 3.1 Run the preflight check locally (optional but recommended)

```bash
cd server
lets preflight
```

This verifies all ML imports resolve without a GPU. If it fails, you have a dependency issue to fix before deploying.

### 3.2 Build the app image via Cloud Build

```bash
lets build
```

This runs `cloudbuild.yaml` which does **four things in sequence:**
1. Runs frontend tests (eslint + tsc + vitest)
2. Runs backend tests (ruff + pytest) — parallel with step 1
3. Builds the Docker image using the base image (fast, ~1-2 min)
4. Pushes to Artifact Registry with both `:latest` and `:<commit-sha>` tags

**Likely issues:**
- **Frontend lint fails (116 pre-existing errors):** The `eslint --quiet` in Cloud Build might still catch these. If it does, you have two options:
  - Quick fix: change `npx eslint . --quiet` to `npx eslint . --quiet || true` in `cloudbuild.yaml` temporarily
  - Proper fix: clean up the 116 lint errors (mostly `@typescript-eslint/no-explicit-any`)
- **vitest fails in Cloud Build:** If `npm ci` installs the right platform binaries for the Cloud Build environment, tests should run. If not, same `|| true` escape hatch while you debug.

### 3.3 Deploy to Cloud Run

```bash
lets deploy
```

This pushes the `:latest` image to the existing Cloud Run service.

**Or do build + deploy + health check in one shot:**

```bash
lets release
```

### 3.4 Watch the first startup

The first cold start will be **slow** (5-10 minutes) because the container downloads SDXL Turbo (~6GB) and other models from HuggingFace on first boot. The startup probe gives it 600 seconds (10 min).

**Monitor it live:**

```bash
gcloud run services logs read lumen-pipeline \
  --project=lumen-pipeline --region=us-east4 --limit=50
```

Or watch in the Cloud Console: https://console.cloud.google.com/run/detail/us-east4/lumen-pipeline/logs?project=lumen-pipeline

**What to look for in the logs:**
- `✓ torch X.X.X` — PyTorch loaded
- `Loading SDXL Turbo...` → `✓ SDXL Turbo loaded` — the big model
- `Loading PartCrafter...` → `✓ PartCrafter loaded`
- `/health/ready` returning `200` — you're live!

**What can go wrong:**
- `403 Forbidden` on HuggingFace downloads → HF_TOKEN is wrong or missing read scope
- `CUDA out of memory` → the L4 has 24GB VRAM; if model loading exceeds this, something is misconfigured
- Startup probe timeout (container killed after 600s) → model download was too slow; check network or increase `failure_threshold`

### 3.5 Test the endpoint

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe lumen-pipeline \
  --project=lumen-pipeline --region=us-east4 \
  --format='value(status.url)')

# Health check
curl -s "$SERVICE_URL/health" | python3 -m json.tool

# Readiness check (detailed)
curl -s "$SERVICE_URL/health/ready" | python3 -m json.tool

# Test a generation (use your API key)
curl -s -X POST "$SERVICE_URL/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -d '{"word": "mountain"}' | python3 -m json.tool
```

---

## Phase 4: Build & Deploy the Frontend

### 4.1 Deploy in one command

```bash
lets deploy-frontend
```

This does three things:
1. Reads the Cloud Run URL from `gcloud` and sets it as `VITE_LUMEN_SERVER_URL`
2. Runs `npm run build` (Vite production build)
3. Syncs the `dist/` folder to the GCS frontend bucket

### 4.2 Verify

```bash
# Get the frontend URL
cd infrastructure/terraform && terraform output frontend_url
```

Open that URL in your browser. You should see the Dots visualization.

**Likely issues:**
- **CORS errors in browser console:** Your `allowed_origins` in `terraform.tfvars` needs to include the GCS URL. Update it and `terraform apply` again, then redeploy the backend.
- **WebSocket/API connection fails:** Check browser dev tools Network tab — the frontend needs to reach the Cloud Run URL. Make sure `VITE_LUMEN_SERVER_URL` was set correctly during the build.

---

## Phase 5: Verify End-to-End

### 5.1 Quick smoke test

1. Open the frontend URL in Chrome
2. Allow microphone access when prompted
3. Say a word (e.g., "ocean") — you should see:
   - Audio captured (SER worker processes emotion)
   - Word sent to backend → `/generate` called
   - 3D point cloud returned → particles morph into shape
   - Transition choreography: dissolve → reform → settle

### 5.2 Check monitoring

```bash
# See if alerts are configured
gcloud monitoring alert-policies list --project=lumen-pipeline

# Check error rate
gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
  --project=lumen-pipeline --limit=10 --format="table(timestamp, textPayload)"
```

---

## Quick Reference: Common Day-to-Day Commands

| What | Command |
|------|---------|
| Code change → deploy backend | `lets release` |
| Code change → deploy frontend | `lets deploy-frontend` |
| Deploy everything | `lets release-all` |
| Dependency change | `lets build-base` then `lets release` |
| Terraform change | `cd infrastructure/terraform && terraform apply` |
| View backend logs | `gcloud run services logs read lumen-pipeline --project=lumen-pipeline --region=us-east4 --limit=50` |
| Check health | `curl -s $(gcloud run services describe lumen-pipeline --project=lumen-pipeline --region=us-east4 --format='value(status.url)')/health` |
| Rotate API key | `gcloud secrets versions add lumen-api-key --data-file=- <<< "new-key"` then redeploy |
| Rotate HF token | `gcloud secrets versions add lumen-hf-token --data-file=- <<< "hf_new_token"` then redeploy |
| Scale to zero (save $) | Set `min_instances = 0` in tfvars → `terraform apply` |

---

## When to Use Claude Agents

The agent prompts we created are in `planning/`. Here's when to trigger each:

**WS1 Agent (Server Pipeline Hardening)** — already done, but use for future server work:
- Adding new model backends
- Modifying the generation pipeline
- Cache layer changes

**WS2 Agent (Client Animation/Choreography)** — for frontend particle work:
- New morph target shapes
- Transition timing changes
- SER emotion-to-physics tuning
- UniformBridge parameter adjustments

**WS4 Agent (Frontend Polish)** — not yet executed, trigger when:
- You want to add UI controls, settings panels
- Accessibility improvements
- Mobile/responsive layout
- Performance profiling (GPU frame time, etc.)

**General debugging agent** — spin up a Claude session with:
- The error logs from Cloud Run
- The specific file(s) involved
- Ask it to diagnose and propose a fix

---

## Estimated Costs

| Resource | Estimate |
|----------|----------|
| Cloud Run (L4 GPU, scale-to-zero) | ~$1.50/hr when active, $0 at idle |
| Artifact Registry | ~$0.10/GB/month (base image ~4GB) |
| Cloud Storage (2 buckets) | ~$0.02/GB/month |
| Cloud Build | 120 free min/day, then $0.003/min |
| Secret Manager | Free under 10K access ops/month |

With scale-to-zero and low usage, expect **$5-20/month** at rest, more during active development.
