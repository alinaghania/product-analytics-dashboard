resource "google_cloud_run_v2_service" "dashboard" {
  name     = local.name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Public URL, as on Vercel: the real gate is verifyAuth() (Firebase ID token
  # + ADMIN_EMAILS) on every API route.
  invoker_iam_disabled = true
  deletion_protection  = var.deletion_protection

  template {
    # Only revision labels reach Cloud Billing — the budget filters on them.
    labels          = local.labels
    service_account = data.google_service_account.runtime.email

    timeout                          = "600s" # the deep revenue analysis streams for 2-3 min
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0 # nothing billed while idle
      max_instance_count = 1 # caps CPU/memory spend, even under constant load
    }

    containers {
      # Placeholder until the first CI deploy; CI owns the image from then on.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "2Gi"
        }
        cpu_idle          = true # request-based billing: CPU only during requests
        startup_cpu_boost = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "CACHE_BUCKET" # lib/server-cache.ts
        value = google_storage_bucket.cache.name
      }

      dynamic "env" {
        for_each = var.app_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.runtime
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    # GitHub Actions ships new images with `gcloud run deploy --image`, which
    # also writes a random nonce label on the revision; Terraform owns
    # everything else without reverting them.
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
      template[0].labels["client.knative.dev/nonce"],
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.runtime_access]
}
