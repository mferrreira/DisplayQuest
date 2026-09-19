# clean-arch · AGENT — Guardrails e praticas do executor

> Modo de operacao para o agente que vai executar o `PLAN.md` contra a `SPEC.md`
> deste folder. Leia antes de tocar qualquer arquivo e releia a cada transicao de
> batch. **Divergencia de SPEC = defeito; improvise para frente nunca.**

## 1. Missao

Executar `clean-arch/PLAN.md` em ondas/batches atomicos, mantendo os gates do
`ARCHITECTURE.md` verdes, registrando cada transicao no `STATE.json` e fechando todas
as ACs da `SPEC.md`. O codigo so e alterado para **reposicionar responsabilidades** —
nunca para "melhorar" comportamento de negocio desta fase.

## 2. Ordem de trabalho (rigida)

1. Ler `clean-arch/ARCHITECTURE.md`, `SPEC.md`, `PLAN.md`, `STATE.json` e o `AGENTS.md`
   da raiz (gotchas reais).
2. Conferir o estado global no STATE: onda e batch atuais, evidencias, baselines.
3. Executar o **proximo batch** do PLAN. So ele. Nunca dois de uma vez.
4. Para cada batch: aplicar a receita R0-R5 (PLAN §3) e rodar os gates do batch.
5. **Vermelho -> rollback** (PLAN §7). **Verde -> registrar evidencia no STATE e**
   **parar** (aguardar proxima instrucao).

## 3. Guardrails (regras que NAO se negocia)

- **Nada de logica de negocio em route handler ou componente.** Rotas parse/HTTP/auth;
  use cases detem regras; infra faz I/O.
- **Dependencia sempre para dentro**: `domain` puro (RG-01/02/03), `application` so
  ve `domain`+proprios ports (RG-03), `infrastructure` implementa ports (RG-04),
  cross-modulo so composition root/eventos (RG-05/10).
- **Prisma so em `infrastructure/` e `backend/repositories/`** (transitorio). Nunca em
  `application/`, `domain/`, `app/api/`. `rg "@prisma/client"` em cada camada proibida
  deve retornar zero.
- **Nenhum `new XRepository()` (ou service) fora de factory/options.** Injete.
- **Erros tipados** (`backend/domain/errors/...`) para condicoes de negocio; rotas
  mapeiam para status estavel (devem haver 403/404/409, nunca 500 generico para o que
  era "acesso negado").
- **Tipos de dominio** em contracts/ports; `@prisma/client` nunca em tipos de dominio.
- **Golden tests ANTES de mexer.** Marcar o diff de saida zero depois.
- **Barrel por camada** (RG-07). Imports entre camadas pelo `index.ts`, nao por
  caminho interno.
- **Frontend intocado** salvo quebra de compilacao/comportamento causada pela mudanca;
  nesse caso, altere **apenas o necessario** e registre no PLAN do batch e no STATE
  (SPEC AC-00-14). Nunca "aproveite" para refatorar UI.

## 4. Praticas tecnicas

- Vitest com env do `.env`: `set -a; source .env; set +a` (o runner le `process.env`,
  e `.env` tem aspas — ok com source).
- G4 exige Postgres: `docker compose up -d postgres` (servico `postgres`, container
  `display-quest-db`; `db` nao e o nome).
- Lint em worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`.
- Mockar seams de dados: mock a lib (`@/lib/database/prisma`) ou o
  `backend/repositories/*`, **nunca** `node:fs/promises` etc. (AGENTS.md gotcha).
- Shims Radix (`tests/setup.ts`) nao podem sumir; sem eles o Select/Dialog nao abre
  silenciosamente no jsdom.
- LSP pode reportar `Cannot find module` falso para `.js`/libs novas — confie em
  `tsc --noEmit` e `vitest`, nao no LSP.
- `npm run arch:check` e G0: se uma violacao for impossivel de eliminar no batch,
  registre na allow-list do dep-cruiser **com referencia de tarefa** e remova na
  Onda 9; allow-list sem dono = defeito.
- Nunca imprimir/commitar `NEXTAUTH_SECRET` real. Nunca `db push` (so migrate).

## 5. Conducao de mudancas de tipo (importante)

Ao trocar um import de `@prisma/client` por enum de dominio ou um model por entidade
de `backend/domain`:

1. Nao mude a **forma** do payload (campos, nomes, nullabilidade) — so a origem do tipo.
2. Se o tipo de dominio for mais estrito que o do Prisma, use o valor mais permissivo
   da forma atual e registre o gap (`decisions[]` ou `blockers[]`).
3. Rode `tsc --noEmit` e o vitest por modulo ANTES e DEPOIS do swap para isolar
   impacto; se algo no cliente (entities/contexts/hooks) quebrar, o swap reverte e
   o fix necessario e tratado como batch proprio (SPEC AC-00-14).

## 6. Checklist por batch (antes de dar `verified`)

| Item | Evidencia |
|---|---|
| Receita R0 golden verde e registrado (para modulos de negocio) | arquivo de teste + STATE `evidence[]` |
| Use cases detem regras (gateway nao tem `throw new Error` de negocio) | diff + grep |
| Contracts/ports sem `@prisma/client` | grep / G0 |
| Em erros tipados | listagem no diff |
| Rotas sem prisma/factory | grep / G0 |
| G0 (com allow-list tipica so com referencia), G1-G3 verdes; G4 quando tocar DB | saidas |
| Frontend intacto ou correcao minima justificada | git status + nota no STATE |
| STATE atualizado (batch `verified`/`done`, DCs, evidencias) | arquivo JSON valido (`json_verify`) |

## 7. Rodar os gates finais da refatoracao

Somente com a Onda 9 e todas as ACs registradas: `npm run arch:check` (G0, zero
violacao sem allow-list), lint completo, `tsc --noEmit`, `vitest run` com Postgres
up, e atualizacao de `backend/README.md`/`docs/`. Apos isso, informar o dono antes
de qualquer commit.