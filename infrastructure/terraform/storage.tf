# ─────────────────────────────────────────────────────────────────────────────
# Cloud Storage — Shape Cache Bucket
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "shape_cache" {
  name     = "lumen-shape-cache-${var.project_id}"
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false # Protect cached data from accidental deletion

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

  depends_on = [google_project_service.required_apis]
}
