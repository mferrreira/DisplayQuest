#!/usr/bin/env bash
# Quality gate: run ALL of it before any checkpoint commit.
#
# B9 (2026-10-08): a ordem abaixo e a da casa (G0..G4 do repo-cleanup, AGENTS.md).
# O guard de banco (scripts/assert-test-db.js) entrou aqui de proposito: `npx vitest
# run` roda a suíte completa, e os roundtrips G4 escrevem no banco. Um DATABASE_URL
# apontando para 5432 (a instancia real) transforma a rodada em escrita sobre dados
# reais — o guard recusa o endereco antes de qualquer teste rodar.
#
# Gate de integracao (G4) — exporte antes de rodar:
#   export DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"
#   npm run db:test:up && npm run db:test:setup   # se o harness de teste nao estiver no ar
#
# Em git worktree, o `npm run lint` abaixo falha por config-cascade (AGENTS.md);
# valide entao com: npx eslint --no-eslintrc --config .eslintrc.json <arquivos tocados>
set -euo pipefail

echo "==> G0 arch:check (dependency-cruiser, allow-list vazia)"
npm run arch:check

echo "==> G1 lint"
npm run lint

echo "==> G2 tsc --noEmit"
npx tsc --noEmit

echo "==> G4 guard: DATABASE_URL contra o banco de teste (5433), nunca o deploy (5432)"
node scripts/assert-test-db.js --require

echo "==> G3+G4 vitest run (unit + features + integracao)"
npx vitest run

echo "✅ verify: all gates green"
