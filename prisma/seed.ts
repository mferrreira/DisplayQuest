// A6 (2026-08-29): seed de desenvolvimento bloqueado fora de NODE_ENV=development.
// A guarda roda ANTES de qualquer carga da seed (require síncrono abaixo é uma
// chamada de corpo — executada em ordem, sem depender de semântica de import da
// engine tsx/esbuild). seed.dev.ts reseta o banco e cria usuários com senha padrão
// ("123") — só deve existir em desenvolvimento.
import { assertSeedAllowed } from "./guard"
import { createRequire } from "node:module"

assertSeedAllowed()

const requireSeedDev = createRequire(import.meta.url)
requireSeedDev("./seed.dev")