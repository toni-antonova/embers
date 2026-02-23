# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — API Key
# ─────────────────────────────────────────────────────────────────────────────
# Stores the Lumen API key in Secret Manager.
# The Cloud Run service account reads it at container startup via
# a secret environment variable reference (see cloud_run.tf).
#
# To set or rotate the key:
#   gcloud secrets versions add lumen-api-key --data-file=- <<< "your-key-here"
# Or via terraform.tfvars:
#   api_key = "your-key-here"
# ─────────────────────────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "api_key" {
  secret_id = "lumen-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "api_key" {
  secret      = google_secret_manager_secret.api_key.id
  secret_data = var.api_key

  # Don't recreate the version if someone rotates the key via gcloud CLI
  lifecycle {
    ignore_changes = [secret_data]
  }
}


# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — HuggingFace Token
# ─────────────────────────────────────────────────────────────────────────────
# Required for downloading gated models (SDXL Turbo, Hunyuan3D-2, etc.)
# from the HuggingFace Hub on first cold start.
#
# To set:
#   gcloud secrets versions add lumen-hf-token --data-file=- <<< "hf_your_token_here"
# Or via terraform.tfvars:
#   hf_token = "hf_your_token_here"
# ─────────────────────────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "hf_token" {
  secret_id = "lumen-hf-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "hf_token" {
  secret      = google_secret_manager_secret.hf_token.id
  secret_data = var.hf_token

  lifecycle {
    ignore_changes = [secret_data]
  }
}
