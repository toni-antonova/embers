# ─────────────────────────────────────────────────────────────────────────────
# Cloud Run v2 Service — Lumen ML Pipeline (GPU-enabled)
# ─────────────────────────────────────────────────────────────────────────────
# Uses google-beta provider for GPU support on Cloud Run.
# Requires:  cpu-throttling: false, startup-cpu-boost: true
# GPU spec:  nvidia.com/gpu resource limit + gpu-type annotation
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Use the provided image, or fall back to a placeholder.
  # On first `terraform apply` before the image exists, use a placeholder
  # that will be updated after the first Cloud Build run.
  image_uri = var.container_image != "" ? var.container_image : "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}/${var.service_name}:latest"
}

resource "google_cloud_run_v2_service" "lumen_pipeline" {
  provider = google-beta

  name     = var.service_name
  location = var.region

  # Protect against accidental `terraform destroy`. For intentional teardown:
  #   terraform apply -var="force_delete=true" then terraform destroy
  deletion_protection = true

  # Ensure traffic always routes to the latest revision
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    # ── Scaling ──────────────────────────────────────────────────────────────
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    # ── Service Account ──────────────────────────────────────────────────────
    service_account = google_service_account.cloud_run_sa.email

    # ── GPU-required annotations ─────────────────────────────────────────────
    annotations = {
      "run.googleapis.com/gpu-type"              = var.gpu_type
      "run.googleapis.com/cpu-throttling"         = "false"
      "run.googleapis.com/startup-cpu-boost"      = "true"
    }

    # ── Disable GPU zonal redundancy (avoids separate quota requirement) ─────
    gpu_zonal_redundancy_disabled = true

    # ── Request timeout ──────────────────────────────────────────────────────
    timeout = "60s"

    # ── Max concurrent requests per instance ─────────────────────────────────
    # GPU models can't safely handle concurrent inference
    max_instance_request_concurrency = 1

    containers {
      image = local.image_uri

      # ── Port ─────────────────────────────────────────────────────────────
      ports {
        container_port = 8080
      }

      # ── Environment Variables ────────────────────────────────────────────
      env {
        name  = "CACHE_BUCKET"
        value = google_storage_bucket.shape_cache.name
      }
      env {
        name  = "MODEL_CACHE_DIR"
        value = "/home/appuser/models"
      }
      env {
        name = "API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "HF_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.hf_token.secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = var.allowed_origins
      }
      # Note: PORT is set automatically by Cloud Run — do not specify it here.

      # ── Resource Limits ──────────────────────────────────────────────────
      resources {
        limits = {
          cpu    = "8"
          memory = "32Gi"
          "nvidia.com/gpu" = "1"
        }
        cpu_idle          = false  # Keep CPU allocated while GPU is active
        startup_cpu_boost = true
      }

      # ── Health Checks ────────────────────────────────────────────────────
      # Startup probe: checks models loaded + cache connected.
      # Returns 503 until ready, so Cloud Run won't route traffic too early.
      # Budget: 60 × 10s = 600s to accommodate 6GB SDXL model download.
      startup_probe {
        http_get {
          path = "/health/ready"
        }
        initial_delay_seconds = 0
        period_seconds        = 10
        failure_threshold     = 60   # 60 × 10s = 600s total
        timeout_seconds       = 5
      }

      # Liveness probe: near-zero cost, just confirms the process is alive.
      # Failure triggers container restart.
      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
      }
    }
  }

  # ── Traffic routing ──────────────────────────────────────────────────────
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required_apis,
    google_artifact_registry_repository.docker_repo,
  ]

  lifecycle {
    # Don't destroy the service if the image tag changes outside Terraform
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

# ── Allow unauthenticated access (public API for now) ────────────────────────

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  provider = google-beta

  name     = google_cloud_run_v2_service.lumen_pipeline.name
  location = google_cloud_run_v2_service.lumen_pipeline.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
