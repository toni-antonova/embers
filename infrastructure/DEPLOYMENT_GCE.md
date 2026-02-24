# Lumen Pipeline — Deployment Pipeline

End-to-end deployment guide for backend (GCE GPU VM) and frontend (GCS static hosting).

> [!IMPORTANT]
> **GPU Quota Required:** You need **NVIDIA L40S** quota in **`us-west1-b`**.
>
> Check availability:
> ```bash
> gcloud compute accelerator-types list --filter="zone:us-west1-b" --format="table(name, description)"
> ```
> Request quota (if needed): [GCP Quotas Console](https://console.cloud.google.com/iam-admin/quotas?usage=USED&metric=nvidia_l40s_gpus)
>
> Machine type: **`g2-standard-8`** (8 vCPU, 32 GB RAM, 1× L40S 48 GB VRAM)

---

## Architecture Overview

```
┌────────────────────┐     HTTPS      ┌──────────────────────┐
│   Frontend (SPA)   │ ────────────── │  GCE GPU VM          │
│   GCS Static Site  │   API calls    │  us-west1-b          │
│   dots-frontend-*  │                │  g2-standard-8       │
│   Vite + React     │                │  1× L40S (48 GB)     │
│                    │                │  Docker + CUDA       │
│   Also served by   │                │  4 models loaded     │
│   Cloud Run (east) │                │  Port 8080           │
└────────────────────┘                └──────────────────────┘
         │                                      │
    gcloud storage                     Artifact Registry
    rsync → GCS                        us-east4 (shared)
```

---

## 1. First-Time Setup (One Time)

### 1a. Provision GCE Infrastructure

```bash
cd infrastructure/gce/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — verify project_id, region, GPU type

terraform init
terraform plan    # Review
terraform apply   # Creates: VM, SA, network, firewall
```

The VM startup script runs automatically (~5–10 min):
- Installs NVIDIA drivers + Docker + NVIDIA Container Toolkit
- Pulls image from Artifact Registry (us-east4)
- Fetches secrets from Secret Manager
- Starts container with `EAGER_LOAD_ALL=true`

### 1b. Verify GCE VM

```bash
# SSH in
gcloud compute ssh lumen-gce-gpu --zone=us-west1-b --tunnel-through-iap

# Inside VM:
nvidia-smi                                    # Should show L40S
docker ps                                     # Should show lumen-server
curl http://localhost:8080/health/ready        # Should show 4 models
```

---

## 2. Deploy Backend (GCE)

### Quick Deploy (one command)

```bash
./infrastructure/gce/scripts/deploy.sh
```

This does:
1. **Build** — Cloud Build builds the Docker image from `server/Dockerfile`
2. **Push** — Image pushed to `us-east4-docker.pkg.dev/.../lumen-pipeline:latest`
3. **SSH** — Connects to VM via IAP tunnel
4. **Restart** — Pulls new image, stops old container, starts new one
5. **Health check** — Polls `/health/ready` until 200

### Skip Build (restart only)

```bash
./infrastructure/gce/scripts/deploy.sh --skip-build
```

### Manual Deploy

```bash
# 1. Build + push via Cloud Build
gcloud builds submit server/ \
  --config=infrastructure/gce/cloudbuild-gce.yaml \
  --project=lumen-pipeline \
  --region=us-west1

# 2. SSH and restart
gcloud compute ssh lumen-gce-gpu --zone=us-west1-b --tunnel-through-iap --command="
  docker pull us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest
  docker stop lumen-server && docker rm lumen-server
  # ... (see deploy.sh for full docker run command)
"
```

---

## 3. Deploy Frontend (GCS)

### Quick Deploy (one command)

```bash
cd server && lets deploy-frontend
```

This does:
1. Fetches the backend URL (currently Cloud Run — update for GCE)
2. Runs `npm run build` with `VITE_LUMEN_SERVER_URL` set
3. Syncs `dist/` to the GCS frontend bucket

### Manual Deploy

```bash
# 1. Build with the GCE backend URL
cd /path/to/dots
VITE_LUMEN_SERVER_URL="http://<GCE_VM_EXTERNAL_IP>:8080" npm run build

# 2. Get the bucket name
BUCKET=$(cd infrastructure/terraform && terraform output -raw frontend_bucket_name)

# 3. Sync dist/ to GCS
gcloud storage rsync dist/ "gs://$BUCKET" -r \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=300"

echo "✓ Deployed to: https://storage.googleapis.com/$BUCKET/index.html"
```

### Point Frontend at GCE Backend

The frontend reads `VITE_LUMEN_SERVER_URL` at build time. To point it at the GCE VM instead of Cloud Run:

```bash
# Get the GCE external IP
GCE_IP=$(cd infrastructure/gce/terraform && terraform output -raw external_ip)

# Build frontend pointing at GCE
VITE_LUMEN_SERVER_URL="http://$GCE_IP:8080" npm run build
```

> [!NOTE]
> For production, you'll want a domain + HTTPS (via Cloud Load Balancer or Cloudflare) in front of the GCE VM rather than using the raw IP.

---

## 4. Full Release (Backend + Frontend)

```bash
# Step 1: Deploy backend
./infrastructure/gce/scripts/deploy.sh

# Step 2: Deploy frontend (pointed at GCE)
GCE_IP=$(cd infrastructure/gce/terraform && terraform output -raw external_ip)
VITE_LUMEN_SERVER_URL="http://$GCE_IP:8080" npm run build

BUCKET=$(cd infrastructure/terraform && terraform output -raw frontend_bucket_name)
gcloud storage rsync dist/ "gs://$BUCKET" -r \
  --delete-unmatched-destination-objects \
  --cache-control="public, max-age=300"
```

---

## 5. Monitoring & Troubleshooting

```bash
# Container logs (live)
gcloud compute ssh lumen-gce-gpu --zone=us-west1-b --tunnel-through-iap \
  --command="docker logs --tail 100 -f lumen-server"

# GPU / VRAM usage
gcloud compute ssh lumen-gce-gpu --zone=us-west1-b --tunnel-through-iap \
  --command="nvidia-smi"

# Health endpoints
curl http://<GCE_IP>:8080/health/ready     # Quick readiness
curl http://<GCE_IP>:8080/health/detailed  # Full diagnostics (needs API key header)
```

---

## 6. Cost Management

```bash
# Stop VM (saves ~$1.44/hr for g2-standard-8 + L40S)
./infrastructure/gce/scripts/teardown.sh --stop-vm

# Restart VM
gcloud compute instances start lumen-gce-gpu --zone=us-west1-b --project=lumen-pipeline

# Fully destroy (removes all GCE resources, Cloud Run unaffected)
cd infrastructure/gce/terraform && terraform destroy
```

---

## Quick Reference

| Component | Location | Deploy Command |
|---|---|---|
| **Backend (GCE)** | `us-west1-b` | `./infrastructure/gce/scripts/deploy.sh` |
| **Backend (Cloud Run)** | `us-east4` | `cd server && lets release` |
| **Frontend** | GCS bucket | `cd server && lets deploy-frontend` |
| **Full release** | Both | `cd server && lets release-all` |

| Resource | What to Check |
|---|---|
| **GPU Quota** | NVIDIA L40S in `us-west1-b` |
| **Machine Type** | `g2-standard-8` |
| **AR Images** | `us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/` |
| **Frontend Bucket** | `dots-frontend-lumen-pipeline` |
