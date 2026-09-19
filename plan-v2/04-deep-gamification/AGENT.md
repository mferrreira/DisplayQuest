# 04 · AGENT — deep-gamification

> Regras de **operacao do agente executor** nesta funcionalidade. Este arquivo e o
> "modo de operacao": como pensar, o que fazer primeiro, o que nao fazer. Leia antes
> de qualquer mudanca de arquivo e releia a cada transicao de lote.

## 1. Missao

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transicao em `STATE.json`.
**Nao ha espaco para "improvisar para frente"; divergencia de SPEC = defeito.**

O coracao do trabalho: **separar XP de moeda de loja** (hoje ambos em `users.points`,
`backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts:135`)
persistindo XP em `users.xp` com nivel/tier por threshold puro e re-avaliacao rolling,
integrar a progressao (RF-53), manter a loja/rewards/purchases intocada (D-04-04) e
entregar lootboxes configuraveis (RF-04-EXT) respeitando a invarriante **XP nunca vira
loot** (D-04-08).

## 2. Ordem de trabalho (regra rigida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato) e `PLAN.md` (caminho de execucao).
3. Conferir `plan-v2/state.json` global e este `STATE.json`: qual a etapa atual, o que as
   evidencias mostram; `01`/`02`/`03` precisam estar `done` antes de implementar.
4. Implementar o **proximo lote** do PLAN (Etapa 1 → 2 → 3 → 4 → 5 → 6 → 7). So o
   proximo. Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (secao 5 do PLAN e secao 6 do
   ARCHITECTURE). **Verde → commitar o lote + atualizar STATE.**

Detalhes de ordem internos:
- Etapa 2: primeiro os engines puros (`level.engine.ts`/`tier.engine.ts`), depois o
  contrato `UserProgression`, depois o gateway persistindo xp/level, sempre com teste na
  mesma etapa; **migracao por ultimo dentro da etapa**, validando `migrate status`.
- Etapa 5: primeiro `lootbox.engine.ts` (roll puro), depois use-cases, depois rotas,
  depois teste; a migracao `add_lootbox_drop_configs_and_openings` fecha a etapa.

## 3. Regras de conduta

- **XP e progression; `users.points` e moeda de loja.** Nunca decremente `xp`; nunca use
  `points` como fonte do nivel/tier. Onde o codigo hoje faz `xp = max(0, user.points)`,
  substitua pela leitura de `users.xp` (gateway) — nao "conserte" na UI.
- **Nenhuma regra de negocio em route handler ou componente de UI** — nivel/tier/roll
  vivem em engines puros (`domain/engines/*`). Rotas apenas traduzem erro tipado para
  HTTP 400/403.
- **Nenhuma dependencia cruzada nova fora da composicao.** Se um dominio precisar de
  outro, registra em `backend/composition/root.ts`; nao importe modulo vizinho direto.
  A loja e consumida via porta do modulo gamification, nunca via `prisma.rewards` direto
  fora do store module.
- **Nao toque em `rewards`/`purchases`** (schema, rotas, use-cases de store): abertura de
  lootbox debita `users.points` via gateway de gamificacao; REWARD_DRAFT so grava voucher
  em `lootbox_openings` (resgate fora de scope).
- `tsc --noEmit` e `vitest` sao a verdade; falso-positivo de LSP nao conta (gotcha
  AGENTS.md: `Cannot find module` para arquivos recem-criados e falso-positivo).
- Valores reais de segredo (NEXTAUTH_SECRET etc.) **nunca** impressos nem commitados.
- **Nunca `prisma db push`**: migracoes versionadas via `npx prisma migrate dev`
  (local) / `deploy` (prod). Esta feature cria 2 migracoes.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; nao escolher um lado.
- Lint em worktree: validar com `npx eslint --no-eslintrc --config .eslintrc.json
  <arquivos>` (workaround AGENTS.md), nunca o `npm run lint` cru em worktree.
- Enviar env para vitest: `set -a; source .env; set +a; npx vitest run` (o `.env` tem
  aspas nos valores; exportar antes).
- Nao commitar `tests/` por padrao (gitignored) — conferir com o dono antes de adicionar
  `!tests/unit` ao `.gitignore` (a casa mantém os testes fora do commit).
- Drop de BADGE aplica **XP uma unica vez**: ddependa do `@@unique([userId, badgeId])`
  para dedup; badge pre-migracao nao da XP retroativo (sem backfill).

## 4. Checklist de verificacao (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | **256/257 de base** (unico fail `floating-session-timer`) + novos testes verdes |
| G4 integracao | `docker compose up -d postgres && npx vitest run` | green (schema/DB tocados) |
| G5 migracao | `npx prisma migrate dev` (local) / `deploy` (prod) | sem `db push`; `migrate status` limpo |

Quando fechar as etapas, atualizar `STATE.json`: ACs da SPEC (AC-04-01..AC-04-16) com
`testRef`/status, `gates`, `evidence[]` (comandos e saidas), `rollbacks[]` se houver,
`timeline`. Nenhuma AC pode ficar `pending` se a feature for declarada pronta.