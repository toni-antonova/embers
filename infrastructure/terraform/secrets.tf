# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — API Key
# ─────────────────────────────────────────────────────────────────────────────
# Terraform creates the secret shell with a placeholder value.
# After `terraform apply`, populate the real key:
#
#   openssl rand -hex 32 | gcloud secrets versions add lumen-api-key --data-file=-
#
# Cloud Run reads it at startup via secret env var (see cloud_run.tf).
# The lifecycle block ensures Terraform won't overwrite manually-set values.
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
# Terraform creates the secret shell with a placeholder value.
# After `terraform apply`, populate the real token:
#
#   gcloud secrets versions add lumen-hf-token --data-file=- <<< "hf_your_token"
#
# Get your token at: https://huggingface.co/settings/tokens (read scope)
# Required for downloading gated models (SDXL Turbo, Hunyuan3D-2, etc.)
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
