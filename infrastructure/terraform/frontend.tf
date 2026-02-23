# ─────────────────────────────────────────────────────────────────────────────
# Cloud Storage — Frontend Static Hosting
# ─────────────────────────────────────────────────────────────────────────────
# Hosts the Vite production build (dist/) as a static website.
# Deploy with: lets deploy-frontend (or gcloud storage rsync)
#
# For custom domain + HTTPS, add a Cloud Load Balancer in front.
# That's a future enhancement — for now, the GCS URL works.
# ─────────────────────────────────────────────────────────────────────────────

resource "google_storage_bucket" "frontend" {
  name     = "dots-frontend-${var.project_id}"
  location = var.region

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html" # SPA: all routes resolve to index.html
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.required_apis]
}

# Allow public read access to the frontend bucket
resource "google_storage_bucket_iam_member" "frontend_public_read" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

output "frontend_url" {
  description = "Frontend static site URL"
  value       = "https://storage.googleapis.com/${google_storage_bucket.frontend.name}/index.html"
}

output "frontend_bucket_name" {
  description = "Frontend bucket name (for gcloud storage rsync)"
  value       = google_storage_bucket.frontend.name
}
