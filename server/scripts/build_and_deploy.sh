#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Build & Deploy — Lumen Server Pipeline
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./scripts/build_and_deploy.sh <project-id> [region]
#
# Examples:
#   ./scripts/build_and_deploy.sh lumen-pipeline
#   ./scripts/build_and_deploy.sh lumen-pipeline us-central1
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Arguments ────────────────────────────────────────────────────────────────
PROJECT_ID="${1:?Usage: $0 <project-id> [region]}"
REGION="${2:-us-central1}"
SERVICE_NAME="lumen-pipeline"
REPO_NAME="lumen-pipeline-docker"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Lumen Server Pipeline — Build & Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Project:  ${PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE_URI}:${TAG}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Configure Docker for Artifact Registry ───────────────────────────
echo ""
echo "▸ Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ── Step 2: Build ────────────────────────────────────────────────────────────
echo ""
echo "▸ Building Docker image..."
docker build \
    -t "${IMAGE_URI}:${TAG}" \
    -t "${IMAGE_URI}:latest" \
    -f Dockerfile \
    .

# ── Step 3: Push ─────────────────────────────────────────────────────────────
echo ""
echo "▸ Pushing to Artifact Registry..."
docker push "${IMAGE_URI}:${TAG}"
docker push "${IMAGE_URI}:latest"

# ── Step 4: Deploy ───────────────────────────────────────────────────────────
echo ""
echo "▸ Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --image "${IMAGE_URI}:${TAG}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --platform managed \
    --quiet

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Deployed successfully!"
echo ""
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format "value(status.url)" 2>/dev/null || echo "<pending>")
echo "  URL: ${SERVICE_URL}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
