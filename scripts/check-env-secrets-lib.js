"use strict"

// A5 (2026-08-29): secrets de infra fora do código.
// Função pura (sem I/O) para ser testada em tests/unit/scripts. O runner
// scripts/check-env-secrets.js chama esta função com o process.env real.

const SECRET_PLACEHOLDERS = ["your-secret-key-here", "<openssl rand -base64 32>"]
const DB_PASSWORD_DENYLIST = ["display-quest123", "postgres", "password", "123456"]
const MIN_SECRET_LENGTH = 32

/**
 * Valida segredos de infra que não devem estar versionados no código.
 * Regras:
 *   - NEXTAUTH_SECRET: obrigatório, sem placeholder, com >= 32 chars;
 *   - POSTGRES_PASSWORD: obrigatório e fora da denylist de defaults publicados.
 * Em desenvolvimento (NODE_ENV=development) as violações viram warnings (a guarda
 * de produção roda com NODE_ENV ausente/diferente → erro).
 *
 * @param {{ NEXTAUTH_SECRET?: string, POSTGRES_PASSWORD?: string, NODE_ENV?: string }} [env]
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function checkEnvSecrets(env = {}) {
  const errors = []
  const warnings = []
  const isDev = env.NODE_ENV === "development"
  const report = (message) => {
    if (isDev) warnings.push(message)
    else errors.push(message)
  }

  const secret = (env.NEXTAUTH_SECRET ?? "").trim()
  const dbPassword = env.POSTGRES_PASSWORD ?? ""

  if (secret === "") {
    report(
      "NEXTAUTH_SECRET ausente/vazio — gere um secret com: openssl rand -base64 32",
    )
  } else if (SECRET_PLACEHOLDERS.includes(secret)) {
    report(
      `NEXTAUTH_SECRET é um placeholder conhecido ("${secret}") — gere um secret com: openssl rand -base64 32`,
    )
  } else if (secret.length < MIN_SECRET_LENGTH) {
    report(
      `NEXTAUTH_SECRET curto demais (${secret.length} chars, mínimo ${MIN_SECRET_LENGTH}) — gere um secret com: openssl rand -base64 32`,
    )
  }

  if (dbPassword === "") {
    report("POSTGRES_PASSWORD ausente/vazio — defina uma senha forte fora do código")
  } else if (DB_PASSWORD_DENYLIST.includes(dbPassword.trim())) {
    report(
      `POSTGRES_PASSWORD na denylist de defaults publicados ("${dbPassword}") — troque por uma senha nova`,
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}

module.exports = {
  checkEnvSecrets,
  SECRET_PLACEHOLDERS,
  DB_PASSWORD_DENYLIST,
  MIN_SECRET_LENGTH,
}