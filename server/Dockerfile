# ============================================================
# Lumen Server — Python 3.13 on NVIDIA CUDA 12.8
# ============================================================
# NVIDIA base images don't ship Python 3.13, so we install it
# via the deadsnakes PPA. Python 3.13 has full wheel support
# for the entire ML stack (PyTorch, diffusers, transformers,
# sentencepiece). UV_TORCH_BACKEND=cu128 tells uv to pull the
# correct CUDA-enabled PyTorch wheel automatically.
#
# Layer order: slowest-changing → fastest-changing
#   1. Base + system packages  (changes: almost never)
#   2. uv installation         (changes: never)
#   3. User + env setup        (changes: never)
#   4. Dependencies            (changes: when pyproject.toml/uv.lock change)
#   5. Application code        (changes: every deploy — only this rebuilds)
# ============================================================

FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04

# ---- System packages + Python 3.13 via deadsnakes ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.13 python3.13-venv python3.13-dev \
    libosmesa6 libosmesa6-dev libgl1 libglib2.0-0 \
    curl \
    g++ make \
    && rm -rf /var/lib/apt/lists/*

# Make python3.13 the default python3
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1

# ---- Install uv ----
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# ---- Non-root user ----
RUN useradd -m appuser
RUN mkdir -p /home/appuser/server && chown appuser:appuser /home/appuser/server
USER appuser
WORKDIR /home/appuser/server

# ---- Environment ----
ENV HF_HOME=/home/appuser/models
ENV TRANSFORMERS_CACHE=/home/appuser/models
ENV PYOPENGL_PLATFORM=osmesa
ENV UV_PYTHON=python3.13
ENV UV_TORCH_BACKEND=cu128

# Model cache directory
RUN mkdir -p /home/appuser/models

# ---- Install project dependencies (cached layer) ----
# uv reads UV_TORCH_BACKEND and automatically selects the CUDA 12.8
# PyTorch variant from PyPI — no --index-url needed.
# Layer caching note: --cache-from in cloudbuild.yaml reuses this entire
# layer when pyproject.toml/uv.lock haven't changed (the 95% case).
COPY --chown=appuser pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---- Vendor PartCrafter (not pip-installable) ----
# Pinned to commit SHA for reproducible builds.
# PartCrafter's src/ is added to PYTHONPATH so `from src.pipelines...` works.
ARG PARTCRAFTER_SHA=269bd4164fbe35b17a6e58f8d6934262822082eb
RUN curl -L "https://github.com/wgsxm/PartCrafter/archive/${PARTCRAFTER_SHA}.tar.gz" | tar xz \
    && mv "PartCrafter-${PARTCRAFTER_SHA}" /home/appuser/partcrafter
ENV PYTHONPATH="/home/appuser/partcrafter:${PYTHONPATH}"

# ---- Copy application code ----
COPY --chown=appuser app/ app/

EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
