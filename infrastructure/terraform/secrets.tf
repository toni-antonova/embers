# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — Secret Shells (values managed outside Terraform)
# ─────────────────────────────────────────────────────────────────────────────
# Terraform only creates the empty secret containers. You populate them
# manually via the GCP Console or gcloud CLI:
#
#   # API key (protects /generate endpoint):
#   openssl rand -hex 32 | gcloud secrets versions add lumen-api-key --data-file=-
#
#   # HuggingFace token (downloads gated models on cold start):
#   gcloud secrets versions add lumen-hf-token --data-file=- <<< "hf_your_token"
#   Get yours at: https://huggingface.co/settings/tokens (read scope)
#
# Cloud Run reads both at container startup via secret env vars (cloud_run.tf).
# ─────────────────────────────────────────────────────────────────────────────

resource "google_secret_manager_secret" "api_key" {
  secret_id = "lumen-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret" "hf_token" {
  secret_id = "lumen-hf-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}
