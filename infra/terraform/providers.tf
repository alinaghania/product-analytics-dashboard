# Credentials come from GOOGLE_OAUTH_ACCESS_TOKEN, exported by tf.sh for the
# project owner. The project is always explicit — never inferred from the local
# gcloud config or ADC, which may point to an unrelated account.
provider "google" {
  project = var.project_id
  region  = var.region

  # The Budgets API rejects user credentials that carry no quota project.
  billing_project       = var.project_id
  user_project_override = true

  # The common mark on every resource that supports labels (infra/README.md,
  # "Finding and deleting everything").
  default_labels = local.labels
}
