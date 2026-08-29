"use strict"

// A10 (2026-08-29): guarda de ambiente do CLI administrativo.
// Função pura (sem I/O) — testada em tests/unit/cli/guard.test.ts. A main do
// cli/index.js decide com base no retorno e loga antes de sair.

/**
 * Decide se o CLI administrativo pode rodar no ambiente atual.
 * Regra (fail-closed): só roda em desenvolvimento, OU com --allow-prod explícito.
 * nodeEnv ausente (undefined/vazio) NÃO é tratado como development aqui — quem
 * chama decide o default (veja cli/index.js, que usa `|| "development"`).
 *
 * @param {{ nodeEnv?: string, allowProd?: boolean }} [options]
 * @returns {boolean}
 */
function assertCliAllowed({ nodeEnv, allowProd = false } = {}) {
  return nodeEnv === "development" || allowProd === true
}

module.exports = { assertCliAllowed }