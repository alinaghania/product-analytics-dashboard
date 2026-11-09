resource "google_monitoring_notification_channel" "budget_email" {
  for_each     = toset(var.alert_emails)
  display_name = "endora-dashboard budget - ${each.value}"
  type         = "email"
  labels       = { email_address = each.value }
  user_labels  = local.labels
}

locals {
  # Further alerts at fixed amounts above the budget, in EUR per month.
  budget_alert_levels_eur = [10, 15, 20]
}

resource "google_billing_budget" "dashboard" {
  billing_account = var.billing_account
  display_name    = "endora-dashboard - ${var.budget_eur} EUR/mois"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
    # Shared project: count only resources labelled app=endora-dashboard (the
    # mobile app's Cloud Functions are Cloud Run services too).
    labels                 = { app = local.name }
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.budget_eur)
    }
  }

  # Alerts only: Google never stops anything when a budget is exceeded.
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  # Thresholds are relative to the budget amount: 10 EUR on a 5 EUR budget = 200 %.
  dynamic "threshold_rules" {
    for_each = local.budget_alert_levels_eur
    content {
      threshold_percent = threshold_rules.value / var.budget_eur
    }
  }
  # Last: the API lists forecast thresholds after the others, and Terraform
  # compares the rules in order (another order shows a diff on every plan).
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = [for channel in google_monitoring_notification_channel.budget_email : channel.id]
    disable_default_iam_recipients   = false
  }

  depends_on = [google_project_service.apis]
}
