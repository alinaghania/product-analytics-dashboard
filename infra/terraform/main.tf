locals {
  name = "endora-dashboard"

  # Common mark: on every resource that supports labels (provider
  # default_labels), and on Cloud Run revisions, whose labels reach billing.
  labels = { app = local.name, managed-by = "terraform" }

  # Resources that don't support labels carry the name prefix and this description.
  description = "endora-dashboard - managed by Terraform (infra/terraform)"

  # Env var name => Secret Manager secret ID. Values are added out of band
  # (gcloud secrets versions add) so they never land in the Terraform state.
  runtime_secrets = {
    REVENUECAT_API_KEY        = "${local.name}-revenuecat-api-key"
    ASC_PRIVATE_KEY           = "${local.name}-asc-private-key"
    ANTHROPIC_FOUNDRY_API_KEY = "${local.name}-anthropic-foundry-api-key"
  }
}

data "google_project" "this" {}

# Pre-existing runtime identity (Firestore viewer + write on the "dashboard"
# database + GA4 access). Read only: Terraform never changes its roles.
data "google_service_account" "runtime" {
  account_id = "endora-dashboard-readonly"
}
