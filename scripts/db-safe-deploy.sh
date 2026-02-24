#!/usr/bin/env bash
set -euo pipefail

echo "==> Prisma safe deploy"

if [[ "${BACKUP_BEFORE_MIGRATE:-0}" == "1" ]]; then
  if command -v pg_dump >/dev/null 2>&1; then
    timestamp="$(date +%Y%m%d_%H%M%S)"
    backup_dir="${BACKUP_DIR:-./backups}"
    mkdir -p "${backup_dir}"
    backup_file="${backup_dir}/db_backup_${timestamp}.sql"
    echo "==> Creating backup at ${backup_file}"
    pg_dump "${DATABASE_URL}" > "${backup_file}"
  else
    echo "==> BACKUP_BEFORE_MIGRATE=1 but pg_dump is not available. Skipping backup."
  fi
fi

echo "==> Running prisma migrate deploy"
npx prisma migrate deploy

if [[ "${RUN_SEED_AFTER_DEPLOY:-0}" == "1" ]]; then
  echo "==> Running prisma db seed"
  npx prisma db seed
fi

echo "==> Done"
