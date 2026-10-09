# 01 · AGENT — roles-permissions

> Regras de **operacao do agente executor** nesta funcionalidade. Este arquivo e o
> "modo de operacao": como pensar, o que fazer primeiro, o que nao fazer. Leia antes
> de qualquer mudanca de arquivo e releia a cada transicao de lote.

## 1. Missao

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transicao em `STATE.json`.
**Nao ha espaco para "improvisar para frente"; divergencia de SPEC = defeito.**

O coracao do trabalho: fazer `approveTask`/`rejectTask` (`backend/modules/task-management/
infrastructure/task-service.gateway.ts:522-632`) respeitarem a divisao **staff task ×
task do lider**, com negacao virando HTTP 403, sem mudar schema e sem mudar as matrizes
`PERMISSIONS`/`FEATURE_ACCESS` existentes.

## 2. Ordem de trabalho (regra rigida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato) e `PLAN.md` (caminho de execucao).
3. Conferir `plan-v2/state.json` global e este `STATE.json`: qual a etapa atual, o que as
   evidencias mostram.
4. Implementar o **proximo lote** do PLAN (Etapa 1 → 2 → 3 → 4 → 5). So o proximo.
   Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (secao 5 do PLAN e secao 6 do
   ARCHITECTURE). **Verde → commitar o lote + atualizar STATE.**

Detalhe de ordem interno (Etapa 3): primeiro a policy em `approval-policy.ts` (pura,
sem I/O), depois o gateway, depois as rotas, sempre com teste na mesma etapa.

## 3. Regras de conduta

- **Nenhuma regra de negocio em route handler ou componente de UI** — a autoridade de
  aprovacao vive em `approval-policy.ts` (dominio). Rotas apenas traduzem o erro tipado
  para HTTP 403 (precedente: `toHttpStatus` em
  `app/api/projects/[id]/members/route.ts:10-25`).
- **Nenhuma dependencia cruzada nova fora da composicao.** O modulo task-management ja
  recebe `identityAccess` e `projectRepository` via `backend/composition/root.ts:39-45`
  e `createTaskManagementGateway`. Se um dominio precisar de outro, registra na composicao
  — nao importe modulo vizinho direto.
- `tsc --noEmit` e `vitest` sao a verdade; falso-positivo de LSP nao conta (gotcha
  AGENTS.md: `Cannot find module` para arquivos recem-criados e falso-positivo).
- Valores reais de segredo (NEXTAUTH_SECRET etc.) **nunca** impressos nem commitados.
- Nao usar `prisma db push`: esta feature nao toca schema → **nenhum comando prisma**;
  se um migrate aparecer por engano, e sinal de drift e **parar**.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; nao escolher um lado.
- Lint em worktree: validar com `npx eslint --no-eslintrc --config .eslintrc.json
  <arquivos>` (workaround AGENTS.md), nunca o `npm run lint` cru em worktree.
- Enviar env para vitest: `set -a; source .env; set +a; npx vitest run` (o `.env` tem
  aspas nos valores; exportar antes).
- Nao commitar `tests/` por padrao (gitignored) — os testes novos desta feature **devem**
  ter `!tests/unit` adicionado ao `.gitignore` se o projeto exigir que sejam commitados;
  **conferir com o dono antes** (a casa os mantem fora do commit).

## 4. Checklist de verificacao (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | **256/257 de base** (unico fail `floating-session-timer`) + novos testes verdes |
| G4 integracao | `n/a` (nenhum toque em DB) | — |
| G5 migracao | `n/a` (sem schema change; sem `db push`) | — |

Quando fechar as etapas, atualizar `STATE.json`: ACs da SPEC (AC-01..AC-11) com
`testRef`/status, `gates`, `evidence[]` (comandos e saidas), `rollbacks[]` se houver,
`timeline`. Nenhuma AC pode ficar `pending` se a feature for declarada pronta.