#!/usr/bin/env bash
# Calls one scheduled job of the panel: cron.sh <monitor|daily|instagram|weekly|monthly|video>
set -euo pipefail
cd "$(dirname "$0")"
secret=$(grep -E '^CRON_SECRET=' .env | cut -d= -f2-)
exec curl -fsS -m "${CRON_TIMEOUT:-1800}" -X POST -H "Authorization: Bearer $secret" "http://127.0.0.1:3000/api/cron/$1"
