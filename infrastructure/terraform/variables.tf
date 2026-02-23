# ─────────────────────────────────────────────────────────────────────────────
# Input Variables
# ─────────────────────────────────────────────────────────────────────────────

variable "project_id" {
  description = "GCP project ID (required, no default)"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "project_id must be set."
  }
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "lumen-pipeline"
}

variable "min_instances" {
  description = "Minimum Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 5
}

variable "gpu_type" {
  description = "GPU accelerator type for Cloud Run"
  type        = string
  default     = "nvidia-l4"
}

variable "container_image" {
  description = "Container image URI. Set after first build, or leave default placeholder."
  type        = string
  default     = ""
}


variable "allowed_origins" {
  description = "Comma-separated CORS origins (e.g. 'https://app.example.com,http://localhost:5173'). Empty = allow all."
  type        = string
  default     = ""
}

variable "alert_email" {
  description = "Email address for monitoring alerts (error rate, latency, crashes)."
  type        = string
  default     = ""
}
