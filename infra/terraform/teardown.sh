#!/usr/bin/env bash
# Deletes EVERYTHING this stack created: Cloud Run service, images, secrets and
# their values, cache bucket and its entries, deployer account, GitHub login
# (WIF), IAM grants, budget and alert channels. Leaves alone what existed before: the endora-dashboard-readonly
# account (used for local dev) and the project's APIs.
set -euo pipefail
cd "$(dirname "$0")"

echo "Ressources gérées par Terraform :"
./tf.sh state list
echo
read -r -p "Tout supprimer ? Tape « endora-dashboard » pour confirmer : " answer
if [[ "$answer" != "endora-dashboard" ]]; then
  echo "Annulé."
  exit 1
fi

# deletion_protection is checked against the Terraform state: lift it there
# first (no change on GCP), then destroy. Terraform asks for a final "yes".
# Skipped when the service is already gone (re-run after a partial destroy):
# a targeted apply would otherwise re-create it.
if ./tf.sh state list | grep -qx 'google_cloud_run_v2_service.dashboard'; then
  ./tf.sh apply -auto-approve -var=deletion_protection=false -target=google_cloud_run_v2_service.dashboard
fi
./tf.sh destroy -var=deletion_protection=false

cat <<'EOF'

Suppression terminée. Reste à faire à la main :
  1. Firebase Console > Authentication > Paramètres > Domaines autorisés :
     retirer les deux domaines endora-dashboard-*.run.app.
  2. Supprimer .github/workflows/deploy-cloudrun.yml (sinon le prochain push échoue).
  3. En dernier, supprimer l'état Terraform :
     gcloud storage rm -r gs://lotus-9663d-endora-dashboard-tfstate --account=support@myendora.health
Conservés volontairement : le compte endora-dashboard-readonly (utilisé en local)
et les APIs du projet (gratuites, partagées avec l'app mobile).
EOF
