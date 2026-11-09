variable "project_id" {
  description = "GCP project, shared with the mobile app's production backend."
  type        = string
  default     = "lotus-9663d"
}

variable "region" {
  description = "Same region as every Firestore database of the project."
  type        = string
  default     = "europe-west1"
}

variable "billing_account" {
  description = "Billing account ID (XXXXXX-XXXXXX-XXXXXX) that receives the budget."
  type        = string
}

variable "budget_eur" {
  description = "Monthly budget in whole EUR (the billing account's currency). Alerts only: Google never stops the service."
  type        = number
  default     = 5

  validation {
    condition     = var.budget_eur > 0 && var.budget_eur == floor(var.budget_eur)
    error_message = "budget_eur must be a positive whole number of euros."
  }
}

variable "alert_emails" {
  description = "Addresses that receive the budget alerts."
  type        = list(string)
}

variable "github_repository_id" {
  description = "Numeric ID of the only GitHub repo allowed to deploy (immutable, unlike its name)."
  type        = string
  default     = "1146768805"
}

variable "app_env" {
  description = "Non-secret runtime config (ADMIN_EMAILS, GA4_PROPERTY_ID, ...). Secrets live in Secret Manager."
  type        = map(string)

  validation {
    condition     = trimspace(lookup(var.app_env, "ADMIN_EMAILS", "")) != ""
    error_message = "app_env must define a non-empty ADMIN_EMAILS, otherwise nobody can sign in."
  }

  validation {
    condition = length(setintersection(keys(var.app_env), [
      "REVENUECAT_API_KEY", "ASC_PRIVATE_KEY", "ANTHROPIC_FOUNDRY_API_KEY",
      "FIREBASE_SERVICE_ACCOUNT", "SERVICE_ACCOUNT_PATH",
    ])) == 0
    error_message = "Secrets belong in Secret Manager, and Cloud Run runs keyless: no service-account key in app_env."
  }
}

variable "deletion_protection" {
  description = "Set to false only to delete everything (teardown.sh)."
  type        = bool
  default     = true
}
