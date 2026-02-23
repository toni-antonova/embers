#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Build and Deploy — Lumen Server to Google Cloud Run
# ─────────────────────────────────────────────────────────────────────────────
# Usage: ./build_and_deploy.sh <project-id> [region]
#
# Image tag uses git SHA for deployment traceability.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <project-id> [region]}"
REGION="${2:-us-central1}"
SERVICE_NAME="lumen-pipeline"
REPO_NAME="lumen-repo"

# Use git SHA for image tagging (not just "latest")
IMAGE_TAG="${3:-$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "=== Building ${IMAGE_URI} ==="
docker build -t "${IMAGE_URI}" server/

echo "=== Pushing to Artifact Registry ==="
docker push "${IMAGE_URI}"

echo "=== Deploying to Cloud Run ==="
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --cpu=4 \
  --memory=16Gi \
  --timeout=60 \
  --concurrency=1 \
  --min-instances=0 \
  --max-instances=5 \
  --port=8080 \
  --allow-unauthenticated \
  --set-env-vars="CACHE_BUCKET=lumen-shape-cache-${PROJECT_ID},LOG_JSON=true"

echo ""
echo "=== Deployed ${IMAGE_TAG} ==="
gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --format="value(status.url)"
