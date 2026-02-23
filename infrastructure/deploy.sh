#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Build, push, and deploy Lumen Pipeline in one command
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   ./infrastructure/deploy.sh          # build + deploy
#   ./infrastructure/deploy.sh --build  # build only (no terraform apply)
#   ./infrastructure/deploy.sh --deploy # deploy only (skip build)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"

BUILD_ONLY=false
DEPLOY_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --build)  BUILD_ONLY=true ;;
    --deploy) DEPLOY_ONLY=true ;;
  esac
done

SHA=$(cd "$REPO_ROOT" && git rev-parse --short HEAD)
echo "━━━ Lumen Deploy ━━━"
echo "  commit: $SHA"
echo ""

# ── Step 1: Build & Push ────────────────────────────────────────────────────
if [ "$DEPLOY_ONLY" = false ]; then
  echo "▶ Building image (commit $SHA)..."
  cd "$REPO_ROOT"
  gcloud builds submit \
    --config infrastructure/cloudbuild.yaml \
    --substitutions=COMMIT_SHA="$SHA" \
    --project=lumen-pipeline --region=us-east4 \
    .
  echo "✓ Image pushed: :$SHA and :latest"
fi

# ── Step 2: Terraform Apply ─────────────────────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  echo ""
  echo "▶ Deploying via Terraform..."
  cd "$TF_DIR"
  terraform apply -auto-approve
  echo "✓ Deployed"
fi

echo ""
echo "━━━ Done ━━━"
