#!/usr/bin/env bash
# Quality gate: run ALL of it before any checkpoint commit.
set -euo pipefail

echo "==> lint"
npx next lint

echo "==> tsc --noEmit"
npx tsc --noEmit

echo "==> vitest run"
npx vitest run

echo "✅ verify: all gates green"
