# ============================================================
# Lumen Server — Python 3.14 on NVIDIA CUDA 12.8
# ============================================================
# NVIDIA base images don't ship Python 3.14, so we install it
# via the deadsnakes PPA. PyTorch 2.10.0 has official cp314
# wheels. UV_TORCH_BACKEND=cu128 tells uv to pull the correct
# CUDA-enabled PyTorch wheel automatically.
# ============================================================

FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04

# ---- System packages + Python 3.14 via deadsnakes ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common gpg-agent \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    python3.14 python3.14-venv python3.14-dev \
    libegl1 libgl1 libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Make python3.14 the default python3
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.14 1

# ---- Install uv ----
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# ---- Non-root user ----
RUN useradd -m appuser
USER appuser
WORKDIR /home/appuser/server

# ---- Environment ----
ENV HF_HOME=/home/appuser/models
ENV TRANSFORMERS_CACHE=/home/appuser/models
ENV PYOPENGL_PLATFORM=egl
ENV UV_PYTHON=python3.14
ENV UV_TORCH_BACKEND=cu128

# Model cache directory
RUN mkdir -p /home/appuser/models

# ---- Install project dependencies (cached layer) ----
# uv reads UV_TORCH_BACKEND and automatically selects the CUDA 12.8
# PyTorch variant from PyPI — no --index-url needed.
COPY --chown=appuser pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---- Copy application code ----
COPY --chown=appuser app/ app/

EXPOSE 8080
CMD ["uv", "run", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080"]
