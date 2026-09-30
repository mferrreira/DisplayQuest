#!/usr/bin/env bash
# clean-arch gate G0 (ARCHITECTURE.md §4 / PLAN §4 gates table).
#
# Runs dependency-cruiser against the scanned tree and propagates the exit code:
#   0 -> conform (modulo the audited allow list, DEC-01)
#   !=0 -> violation: the batch goes RED and the rollback policy applies (PLAN §7)
#
# --ts-config is NOT optional: without it `@/lib/...` aliases count as external modules
# and every RG-01..RG-06 rule would silently pass.
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG=".dependency-cruiser.js"
TS_CONFIG="tsconfig.json"

if [ ! -f "$CONFIG" ]; then
  echo "arch-check: missing $CONFIG" >&2
  exit 2
fi

# Audited allow list (DEC-01). OND9-B3 requires this number to be zero.
ALLOWED_TASKS="$(grep -c 'task: "OND' "$CONFIG" || echo 0)"
echo "arch-check: allow-list entries pinned to a wave/batch task: ${ALLOWED_TASKS}"

STATUS=0
# Must stay identical to the `arch:check` npm script (that one is the gate referenced by
# ARCHITECTURE.md §4; this wrapper exists for the Linux/dev-container workflow).
npx depcruise --config "$CONFIG" --ts-config "$TS_CONFIG" --ts-pre-compilation-deps --output-type err . || STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  echo "arch-check: G0 green (no violation outside the allow list)"
else
  echo "arch-check: G0 RED (exit ${STATUS})" >&2
fi

exit "$STATUS"
