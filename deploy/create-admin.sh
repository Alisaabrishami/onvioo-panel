#!/usr/bin/env bash
# Creates (or resets) an admin account. The password is asked for, so it stays out of shell history.
set -euo pipefail
cd "$(dirname "$0")"
read -rp "نام: " name
read -rp "شماره موبایل: " phone
read -rsp "رمز عبور (حداقل ۸ کاراکتر): " password; echo
docker compose run --rm migrate node node_modules/tsx/dist/cli.mjs scripts/create-admin.mts "$name" "$phone" "$password"
