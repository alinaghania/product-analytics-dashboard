# Keyless deploys from GitHub Actions (Workload Identity Federation): the
# workflow trades its OIDC token for short-lived credentials of the deployer
# account. Nothing to store in GitHub.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.name}-github"
  display_name              = "endora-dashboard GitHub"
  description               = local.description
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions"
  description                        = local.description

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  # Only the deploy workflow of this repo (matched by immutable ID — the repo
  # is public), on main, started by a push or by hand, can get credentials.
  # Renaming the workflow file requires updating this condition.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.workflow_ref.endsWith('/.github/workflows/deploy-cloudrun.yml@refs/heads/main')",
    "assertion.event_name in ['push', 'workflow_dispatch']",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deployer" {
  account_id   = "${local.name}-deployer"
  display_name = "endora-dashboard deployer (GitHub Actions)"
  description  = local.description
}

resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_cloud_run_v2_service_iam_member" "deployer_deploy" {
  location = google_cloud_run_v2_service.dashboard.location
  name     = google_cloud_run_v2_service.dashboard.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# `gcloud run deploy` waits on a Cloud Run operation, which needs
# run.operations.get at the project level. A one-permission custom role grants
# exactly that — project-level run.developer would let CI modify the mobile
# app's 30 Cloud Functions.
resource "google_project_iam_custom_role" "run_operations_viewer" {
  role_id     = "endoraDashboardRunOperationsViewer"
  title       = "endora-dashboard - Cloud Run operations viewer"
  description = local.description
  permissions = ["run.operations.get"]
}

resource "google_project_iam_member" "deployer_run_operations" {
  project = var.project_id
  role    = google_project_iam_custom_role.run_operations_viewer.id
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Revisions run as endora-dashboard-readonly: deploying one requires actAs on it.
resource "google_service_account_iam_member" "deployer_act_as_runtime" {
  service_account_id = data.google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}
