#!/usr/bin/env bash
# Runs Terraform as the owner of lotus-9663d, never with this machine's default
# gcloud account or ADC (they may belong to an unrelated account and project).
# Usage: infra/terraform/tf.sh init | plan | apply | output service_url ...
set -euo pipefail

ACCOUNT="support@myendora.health"

GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token --account="$ACCOUNT")"
export GOOGLE_OAUTH_ACCESS_TOKEN

exec terraform -chdir="$(dirname "$0")" "$@"
