# ─────────────────────────────────────────────────────────────────────────────
# Secret Manager — API Key & HuggingFace Token
# ─────────────────────────────────────────────────────────────────────────────
# Terraform creates the secrets with placeholder values on first apply.
# Replace with real values later via GCP Console or gcloud:
#
#   openssl rand -hex 32 | gcloud secrets versions add lumen-api-key --data-file=-
#   gcloud secrets versions add lumen-hf-token --data-file=- <<< "hf_your_token"
#
# The lifecycle blocks ensure `terraform apply` never overwrites your
# real values once set — it only touches them on initial creation.
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
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret" "hf_token" {
  secret_id = "lumen-hf-token"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "hf_token" {
  secret      = google_secret_manager_secret.hf_token.id
  secret_data = "PLACEHOLDER_REPLACE_ME"

  lifecycle {
    ignore_changes = [secret_data]
  }
}
