terraform {
  required_version = ">= 1.5.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
  }

  # Created once with gcloud (infra/README.md, "Bootstrap"): Terraform can't
  # create the bucket that holds its own state.
  backend "gcs" {
    bucket = "lotus-9663d-endora-dashboard-tfstate"
  }
}
