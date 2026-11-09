# Private bucket behind the dashboard's server-side cache (lib/server-cache.ts):
# API results are reused by every admin until midnight Europe/Paris, so pages
# stop re-reading thousands of Firestore documents on each visit. Unlike the
# in-memory layer, it survives the instance stopping (0 instances when idle).
resource "google_storage_bucket" "cache" {
  name     = "${var.project_id}-${local.name}-cache"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Entries expire at midnight, so an object older than a day is dead: delete
  # it (entries are copies of user data). Soft delete is off for the same
  # reason, and so that replaced entries aren't kept (and billed) for 7 days.
  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }

  soft_delete_policy {
    retention_duration_seconds = 0
  }

  # Disposable content: teardown.sh must be able to delete a non-empty bucket.
  force_destroy = true
}

# Read/write on this bucket only, for the service's runtime identity.
resource "google_storage_bucket_iam_member" "cache_runtime" {
  bucket = google_storage_bucket.cache.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${data.google_service_account.runtime.email}"
}
