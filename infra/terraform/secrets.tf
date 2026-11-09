# Secrets are created empty: values are added with `gcloud secrets versions add`
# (infra/README.md) so they never appear in the Terraform state.

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.runtime_secrets
  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

# Public Firebase web config (NEXT_PUBLIC_*, dotenv format). CI writes it to
# .env.production before `next build`; it stays out of the repo, which is public.
resource "google_secret_manager_secret" "build_env" {
  secret_id = "${local.name}-build-env"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each  = google_secret_manager_secret.runtime
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_service_account.runtime.email}"
}

resource "google_secret_manager_secret_iam_member" "build_env_deployer" {
  secret_id = google_secret_manager_secret.build_env.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}
