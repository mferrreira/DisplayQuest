"use strict"

// A5 (2026-08-29): guarda de secrets de infra para deploy.
// Uso: npm run check:env  (NODE_ENV=development opcional para rebaixar a warning)

const { checkEnvSecrets } = require("./check-env-secrets-lib")

const result = checkEnvSecrets(process.env)

for (const warning of result.warnings) {
  console.warn(`[warn] ${warning}`)
}
for (const error of result.errors) {
  console.error(`[error] ${error}`)
}

if (result.errors.length > 0) {
  console.error(
    "\nCorrija os itens acima antes de subir. Copie .env.example para .env e preencha os valores reais.",
  )
  process.exit(1)
}

if (result.warnings.length > 0) {
  console.log("check:env concluído — apenas avisos de desenvolvimento (NODE_ENV=development).")
} else {
  console.log("check:env OK — secrets fora do código.")
}