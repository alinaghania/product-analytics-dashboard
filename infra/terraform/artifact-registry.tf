resource "google_artifact_registry_repository" "images" {
  repository_id = local.name
  location      = var.region
  format        = "DOCKER"
  description   = "Dashboard images, pushed by GitHub Actions (one tag per git commit)"

  docker_config {
    immutable_tags = true
  }

  # Keep the 5 newest images (rollback depth); delete the others after a day.
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-5-newest"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "86400s"
    }
  }
}
