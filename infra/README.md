# Infrastructure — Cloud Run (GCP)

The dashboard runs on **Cloud Run** in project `lotus-9663d`, region `europe-west1` (the same region as every Firestore database). The project is shared with the mobile app's production backend (its Cloud Functions are Cloud Run services too). This stack therefore only **adds** resources, uses non-authoritative IAM grants, and never disables an API.

| Piece | What |
|---|---|
| Cloud Run service `endora-dashboard` | 0–1 instance, 1 vCPU / 2 GiB, request-based billing, timeout 600 s, public URL (auth = `verifyAuth()` in the app) |
| Runtime identity | Existing `endora-dashboard-readonly` service account, **keyless** (ADC from the metadata server) |
| Images | Artifact Registry `endora-dashboard`, immutable tags = git SHA, 5 newest kept |
| Secrets | Secret Manager `endora-dashboard-*` (3 runtime secrets + `build-env` for the public `NEXT_PUBLIC_*` config) |
| Cache | Bucket `lotus-9663d-endora-dashboard-cache`: API results shared by every admin until midnight (Paris), objects deleted after a day (see "Server cache") |
| Deploys | `.github/workflows/deploy-cloudrun.yml` on every push to `main`, keyless (Workload Identity Federation) |
| Budget | 5 EUR/month on resources labelled `app=endora-dashboard`, e-mails at 50/90/100 % and forecast 100 % — alerts only, nothing is stopped |

Terraform lives in `infra/terraform/`. Always run it through `infra/terraform/tf.sh`, which authenticates as `support@myendora.health` instead of the machine's default gcloud account.

## Prerequisites

- Terraform ≥ 1.5.7 — the version Homebrew core ships works with the pinned `hashicorp/google ~> 8.10` provider, so no upgrade is needed
- `gcloud` logged in with `support@myendora.health` (`gcloud auth login support@myendora.health`)

## Bootstrap (once)

1. State bucket — the only resource created outside Terraform:
   ```bash
   gcloud storage buckets create gs://lotus-9663d-endora-dashboard-tfstate \
     --project=lotus-9663d --account=support@myendora.health \
     --location=europe-west1 --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets update gs://lotus-9663d-endora-dashboard-tfstate \
     --versioning --update-labels=app=endora-dashboard --account=support@myendora.health
   ```
2. `cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars` and fill it in (git-ignored).
3. `infra/terraform/tf.sh init`
4. Create the secrets first — a Cloud Run revision can't reference a secret without a version:
   ```bash
   infra/terraform/tf.sh apply -target=google_secret_manager_secret.runtime -target=google_secret_manager_secret.build_env
   ```
5. Add the secret values (`printf`, not `echo`, which appends a newline; the array form works in zsh and bash):
   ```bash
   A=(--project=lotus-9663d --account=support@myendora.health)
   printf %s "$REVENUECAT_API_KEY" | gcloud secrets versions add endora-dashboard-revenuecat-api-key --data-file=- "${A[@]}"
   printf %s "$ANTHROPIC_FOUNDRY_API_KEY" | gcloud secrets versions add endora-dashboard-anthropic-foundry-api-key --data-file=- "${A[@]}"
   gcloud secrets versions add endora-dashboard-asc-private-key --data-file=path/to/AuthKey_XXXX.p8 "${A[@]}"
   grep '^NEXT_PUBLIC_' .env | gcloud secrets versions add endora-dashboard-build-env --data-file=- "${A[@]}"
   ```
6. `infra/terraform/tf.sh apply` — the plan must only **create** resources.
7. Firebase Console → Authentication → Settings → Authorized domains: add **both** hostnames of the service — Cloud Run serves it on `endora-dashboard-<project number>.europe-west1.run.app` and on the older `endora-dashboard-<hash>-ew.a.run.app` (the one `tf.sh output service_url` prints). List them with `gcloud run services describe endora-dashboard --region=europe-west1 --project=lotus-9663d --format='value(metadata.annotations."run.googleapis.com/urls")'`. Not in Terraform on purpose: its resource for this owns the mobile app's whole Auth config.
8. First deploy: run the "Deploy to Cloud Run" workflow (`gh workflow run deploy-cloudrun.yml`, or push to `main`). Then `infra/terraform/tf.sh plan` must report **No changes**.

## Day to day

- **Deploy**: push to `main`. The workflow builds the image (or reuses it when this commit was already built — tags are immutable), deploys it and checks that `/` answers 200 and `/api/auth/me` 401 without a token. GCP only accepts that exact workflow file on `main`: renaming it requires updating the condition in `github-wif.tf`.
- **Change config** (admin e-mails, model names…): edit `terraform.tfvars`, then `tf.sh apply`.
- **Rotate a secret**: `gcloud secrets versions add …` with the new value, re-run the deploy workflow (a new revision reads `latest`), then destroy the old version (`gcloud secrets versions destroy <n> --secret=…`) — every enabled version is billed.
- **Rollback**: redeploy a previous image (the 5 newest are kept):
  ```bash
  gcloud run deploy endora-dashboard --region=europe-west1 --project=lotus-9663d --account=support@myendora.health \
    --image=europe-west1-docker.pkg.dev/lotus-9663d/endora-dashboard/app:<previous-commit-sha>
  ```
  Prefer this to pinning traffic on an old revision (`update-traffic --to-revisions`): once traffic is pinned, later CI deploys create revisions that get 0 % of it (the smoke test still passes against the old one). If it happened, `gcloud run services update-traffic endora-dashboard --to-latest --region=europe-west1` restores the normal behaviour.
- **Logs**: `gcloud run services logs read endora-dashboard --region=europe-west1 --project=lotus-9663d --account=support@myendora.health`

## Server cache

To cut Firestore reads (and LLM calls), `lib/server-cache.ts` keeps the result of every non-Overview API route until midnight Europe/Paris, for all admins: first in the instance's memory, then in the cache bucket, which survives the instance stopping.

- **Live data**: the Overview is never cached, except its retention curve once the activity window it measures is over (it can't change before midnight). Reads of the `dashboard` database (contacts, history) and writes are never cached either.
- **Forcing a refresh**: "Reload All" (or a card's reload icon) recomputes the data on display with `?fresh=1`; data the page hasn't loaded yet still comes from the cache, and the Overview's retention curve is never recomputed (it can't change before midnight). The header shows when cached figures were computed. "Régénérer" (conversation insights) and "Relancer l'analyse" (deep analysis) recompute the AI results.
- **Never kept**: errors, and results missing part of their data (a failed section of a user profile, a RevenueCat call that failed, a deep analysis with errors): they are served once, then recomputed.
- **Deploys**: entries are stored under the Cloud Run revision name, so a deploy starts from an empty cache.
- **Purge everything**: `gcloud storage rm "gs://lotus-9663d-endora-dashboard-cache/**" --account=support@myendora.health`, then let the instance restart (or deploy) to clear its memory.
- **Logs**: `[cache] computed <scope> in … ms` for each computation, `[cache] restored <scope> from the bucket` after a cold start, warnings if the bucket can't be read or written (the request is still served).

## Costs

Expected ~1–2 €/month: nothing is billed while idle (0 instances), CPU is billed only while serving requests, and `max 1 instance` caps CPU + memory at ~70 €/month even under constant load. The cache bucket costs well under 0.01 €/month. The free tiers are shared by the whole billing account (and mostly used by the mobile app's functions). Firestore reads made by the dashboard are billed to Firestore and are outside this budget.

## Finding and deleting everything

Every resource created for the dashboard carries a common mark:

- label `app=endora-dashboard` on everything that supports labels: Cloud Run service **and** its revisions, image repository, secrets, alert channels, cache and state buckets;
- name prefix `endora-dashboard` + description "managed by Terraform" on what doesn't (deployer service account, WIF pool, budget, the `endoraDashboardRunOperationsViewer` custom role). IAM grants are deleted with the rest.

Inventory:
```bash
infra/terraform/tf.sh state list
gcloud asset search-all-resources --scope=projects/lotus-9663d --query="labels.app:endora-dashboard" --account=support@myendora.health
```

Delete everything: `infra/terraform/teardown.sh` (asks you to type `endora-dashboard`, lifts the deletion protection, then `terraform destroy`). Then, by hand:

1. Remove the two `endora-dashboard-*.run.app` domains from the Firebase authorized domains.
2. Delete `.github/workflows/deploy-cloudrun.yml` (the next push would fail otherwise).
3. Last, delete the state: `gcloud storage rm -r gs://lotus-9663d-endora-dashboard-tfstate --account=support@myendora.health`

Kept on purpose: the `endora-dashboard-readonly` account (it predates this stack and serves local dev) and the project's APIs (free, shared with the mobile app). The WIF pool and the custom role are soft-deleted first (30 and 37 days), during which their IDs can't be reused.

## Troubleshooting

- **Every API call returns 401**: read the logs — `[auth] ID token verification failed: …` gives the real cause (credentials, project ID…), and check that the `*.run.app` domain is authorized in Firebase.
- **A page shows outdated figures**: they come from the server cache (the header says from when). "Reload All" recomputes them; see "Server cache".
- **GA4 cards fall back to tracking sessions** (`/api/metrics/ga4-activity` → 503): the keyless GA4 call failed. Fallback: store the service-account JSON in a secret and expose it as `FIREBASE_SERVICE_ACCOUNT` (the code already supports it).
- **Deploy fails with a permission error**: the deployer only has `run.developer` on this service, `run.operations.get` on the project (custom role — `gcloud run deploy` waits on an operation), actAs on the runtime account, push on the image repository and read on the build-env secret. Never widen it to project-level `run.developer`: that would let CI modify the mobile app's Cloud Functions.
- **`tf.sh plan` shows changes after a CI deploy**: CI must only change the image (and gcloud's nonce label), both ignored in `cloud-run.tf`. Any other drift means someone changed the service by hand — re-apply or port the change into Terraform.
