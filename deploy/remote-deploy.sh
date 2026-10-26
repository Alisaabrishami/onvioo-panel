#!/usr/bin/env bash
# Runs on the server after the workflow uploads a new image: load it, migrate, restart.
set -euo pipefail
cd "$(dirname "$0")"
gunzip -c image.tar.gz | docker load
rm -f image.tar.gz
docker tag "onvioo-panel:$1" onvioo-panel:latest
chmod +x ./*.sh
docker compose up -d --remove-orphans
# Keep the current and previous image for a quick rollback
docker images onvioo-panel --format '{{.Tag}}' | grep -vE "^(latest|$1)$" | tail -n +2 | xargs -r -I{} docker rmi "onvioo-panel:{}" || true
docker compose ps
