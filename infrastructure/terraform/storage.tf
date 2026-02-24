# ─────────────────────────────────────────────────────────────────────────────
# Cloud Storage — Shape Cache Bucket + Model Weights Bucket
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "shape_cache" {
  name     = "lumen-shape-cache-${var.project_id}"
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  # Delete cached shapes older than 90 days
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  # Optional: transition to cheaper storage after 30 days for cost savings
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  versioning {
    enabled = false # Point clouds are immutable, no need for versioning
  }

  # Bucket location is immutable — don't recreate bucket on region changes
  lifecycle {
    ignore_changes = [location]
  }

  depends_on = [google_project_service.required_apis]
}

# ─────────────────────────────────────────────────────────────────────────────
# Cloud Storage — Model Weights Bucket
# ─────────────────────────────────────────────────────────────────────────────
# Stores pre-downloaded HuggingFace model weights (SDXL Turbo, PartCrafter,
# RMBG) so Cloud Run containers sync from same-region GCS (~8-15s) instead
# of downloading from HuggingFace Hub (~90-180s) on every cold start.
#
# Populate once:  uv run python scripts/upload_model_weights.py \
#                   --bucket lumen-model-weights-<project-id>
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "model_weights" {
  name     = "lumen-model-weights-${var.project_id}"
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  # No lifecycle rules — model weights are permanent and rarely updated.
  # To swap models, upload new weights and redeploy.

  versioning {
    enabled = false # Weights are immutable per model version
  }

  # Bucket location is immutable — don't recreate bucket on region changes
  lifecycle {
    ignore_changes = [location]
  }

  depends_on = [google_project_service.required_apis]
}
