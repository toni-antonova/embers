# ─────────────────────────────────────────────────────────────────────────
# Example terraform.tfvars — copy to terraform.tfvars and fill in values
# ─────────────────────────────────────────────────────────────────────────

# REQUIRED — your GCP project ID
project_id = "lumen-pipeline"

# Optional overrides (defaults shown)
region        = "us-east4"
# service_name  = "lumen-pipeline"
# min_instances = 0
# max_instances = 5
# gpu_type      = "nvidia-l4"
max_instances = 1

# Set after first build. Leave empty for initial apply.
# container_image = "us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest"
container_image = "us-east4-docker.pkg.dev/lumen-pipeline/lumen-pipeline-docker/lumen-pipeline:latest"

# API key for client authentication (stored in Secret Manager)
api_key = "5x6GysQOCbNWS5zmzBiHpcZNWu4rtZNJPUu2DNrmLG8"
