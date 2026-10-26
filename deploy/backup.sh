#!/usr/bin/env bash
# Daily database dump into backups/, keeping the last 14 days
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
docker compose exec -T db pg_dump -U onvioo onvioo | gzip > "backups/onvioo-$(date +%F).sql.gz"
find backups -name 'onvioo-*.sql.gz' -mtime +14 -delete
