# 03 · AGENT — Project Lifecycle & Reports

> Regras de **operacao do agente executor** nesta funcionalidade. Este arquivo e o
> "modo de operacao": como pensar, o que fazer primeiro, o que nao fazer. Leia antes
> de qualquer mudanca de arquivo e releia a cada transicao de lote.

## 1. Missao

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transicao em `STATE.json`.
**Nao ha espaco para "improvisar para frente"; divergencia de SPEC = defeito.**

O nucleo do trabalho: fechar `periodType` em enum `ProjectPeriod`, ancorar periodos
relativos via `projects.startedAt`, criar a agregacao por periodo **derivada da
consolidacao semanal (RF-43)** e entregar o **contrato** da brochura PDF — render real
**nao** (D-03-01): fica `blocked` ate o template.

## 2. Ordem de trabalho (regra rigida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato), `PLAN.md` (caminho) e `03/STATE.json`.
3. Conferir `plan-v2/state.json` global e este `STATE.json`: etapa atual e evidencias.
4. Implementar o **proximo lote** do PLAN (Etapa 1 -> 2 -> 3 -> 4 -> 5). So o proximo.
   Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho -> rollback** (PLAN secao 5 e ARCHITECTURE secao 6).
   **Verde -> commitar o lote + atualizar STATE.**

Ordem interna (Etapa 1): primeiro `schema.prisma` + migracao, depois
`lib/constants/report-periods.ts` (fonte unica), depois `contracts.ts`/gateway/rotas,
sempre com teste no mesmo lote.

## 3. Regras de conduta

- **Fonte unica de periodicidade:** toda referencia a tipos de periodo vem de
  `lib/constants/report-periods.ts` (`ProjectPeriod`/`computePeriod`/`listPeriods`/
  `resolveProjectAnchor`/`computeRelativePeriod`). Nao recrie unions de strings em
  contratos ou rotas. Anti-scatter a cada commit:
  `rg '"weekly"|"biweekly"|"semiannual"|"annual"' backend app lib -g '!.env'` = vazio
  (so o backfill da migracao menciona os valores legados).
- **Schema/migracao:** sem `prisma db push`. Migracao versionada UNICA
  (`project_period_enum`) com backfill SQL e dedup deterministico ANTES do `UNIQUE`.
  Nunca editar migracao ja aplicada. `migrate status` sem drift a cada lote.
- **D-03-05 (biweekly) e D-03-07 (set de VIEW_ALL_REPORTS) sao "proposed"**: nao
  "resolver na mao". Se a ratificacao do dono ainda nao veio e a Etapa 1 (backfill) ou
  a Etapa 3 (RBAC) precisa dela, **parar e reportar**; nao escolher um lado.
- **Sem consolidacao paralela:** a agregacao por periodo deriva das primitivas de
  RF-43 (`duration`/3600 de `work_sessions.status = "completed"`, `startOfWeek`
  segunda). Nao criar tabela/resumo novo de horas (D-03-04).
- **Brochura PDF = contrato apenas:** implementar DTO + port + renderer placeholder
  (501 `BrochureTemplateUnavailableError`). Nada de renderer real, lib de PDF,
  template ou pixel — bloqueado por D-03-01. Se um PR tentar "aproveitar" e desenhar
  o PDF, e drift; parar.
- **Nenhuma regra de negocio em route handler:** assercoes de
  view/generate/attachments vivem no gateway do moedor reporting (ex.: 660-684);
  rotas so traduzem erro tipado (`toHttpStatus`). Sem `hasPermission` novo em rota.
- **RBAC sem desfazer 01:** adicionar apenas a chave `VIEW_ALL_REPORTS` em `rbac.ts` +
  espelho em `features.ts` (paridade via teste). Nao reabrir matrizes existentes.
- `tsc --noEmit` e `vitest` sao a verdade; falso-positivo de LSP nao conta (gotcha
  AGENTS.md: `Cannot find module` p/ arquivos recem-criados e falso-positivo).
- Valores reais de segredo (NEXTAUTH_SECRET etc.) **nunca** impressos nem commitados.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; nao escolher um lado.
- Enviar env para vitest: `set -a; source .env; set +a; npx vitest run`. Lint em
  worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`.
- Nao commitar `tests/` por padrao (gitignored) — conferir com o dono se os testes da
  feature devem entrar no commit (`!tests/unit`).

## 4. Checklist de verificacao (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | **256/257 de base** (unico fail `floating-session-timer`) + ~10-12 unit novos verdes |
| G4 integracao | `docker compose up -d postgres && npx vitest run` | green (`period-migration-backfill`, `period-reporting-roundtrip`) |
| G5 migracao | `npx prisma migrate dev` (local) / `deploy` (prod) | sem `db push`; sem drift (`migrate status`) |
| Anti-scatter | `rg "ProjectReportPeriodType"` no codigo runtime | so alias unico de `ProjectPeriod`; zero values legados fora do backfill da migracao |
| Single-source | `rg "isReportPeriodType|computePeriod"` | so via `lib/constants/report-periods.ts` |
| STATE | AC-03-01..AC-03-13 com testRef/status; blockers (template PDF, ratificacoes); evidence[] | nenhuma AC `pending` se declarada pronta |

Quando fechar as etapas, atualizar `STATE.json`: ACs, `gates`, `evidence[]`
(comandos/saidas), `rollbacks[]`, `blockers` e `timeline`. No render da brochura,
registrar o milestone como `blocked` com a acao do dono (entregar template).