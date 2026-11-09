# Only the APIs this stack needs that weren't enabled yet. run, artifactregistry,
# secretmanager, iam, iamcredentials, monitoring and cloudresourcemanager are
# already on (the mobile app's Cloud Functions use them) and stay unmanaged.
# disable_on_destroy = false: deleting the dashboard must never switch off an
# API in this shared production project.
resource "google_project_service" "apis" {
  for_each = toset([
    "sts.googleapis.com",            # keyless GitHub Actions login (WIF)
    "billingbudgets.googleapis.com", # budget alert
    "cloudbilling.googleapis.com",
    "cloudasset.googleapis.com", # inventory by label
  ])

  service            = each.value
  disable_on_destroy = false
}
