output "service_url" {
  description = "Default Cloud Run URL of the dashboard (kept out of the public repo)."
  value       = google_cloud_run_v2_service.dashboard.uri
}

output "image_repository" {
  description = "Image path used by CI (tagged with the git commit SHA)."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}/app"
}

output "workload_identity_provider" {
  description = "Value for google-github-actions/auth in the deploy workflow."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}

output "deployer_service_account" {
  description = "Service account the deploy workflow impersonates."
  value       = google_service_account.deployer.email
}

output "cache_bucket" {
  description = "Bucket of the server-side cache (lib/server-cache.ts)."
  value       = google_storage_bucket.cache.name
}
