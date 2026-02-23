# ============================================================
# Lumen Server — Application Image (fast builds)
# ============================================================
# Uses the pre-built base image which contains all system packages,
# Python, uv, dependencies, and PartCrafter already installed.
# This Dockerfile ONLY copies app code — builds take 1-2 minutes
# instead of 15-30 minutes.
#
# If the base image doesn't exist yet, build it first:
#   gcloud builds submit --config infrastructure/cloudbuild-base.yaml \
#     --project=lumen-pipeline --region=us-east4 server/
#
# Fallback: set BUILD_ARG BASE_IMAGE=nvidia/cuda:12.8.0-runtime-ubuntu24.04
# to do a full build (slow but works without the base image).
# ============================================================

ARG BASE_IMAGE=us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-base:latest

FROM ${BASE_IMAGE}

# ---- Refresh dependencies if pyproject.toml/uv.lock changed ----
# If the base image already has the same deps, this is a no-op (<1s).
# If deps changed, only the delta is installed (~30-60s vs 15-30min).
COPY --chown=appuser pyproject.toml uv.lock ./
# --no-install-package torch-cluster: the base image installed the working
# pre-built PyG wheel; uv sync would replace it with the broken PyPI sdist.
RUN uv sync --frozen --no-dev --no-install-project --no-install-package torch-cluster

# ---- Copy application code (the only thing that changes per deploy) ----
COPY --chown=appuser app/ app/

EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
