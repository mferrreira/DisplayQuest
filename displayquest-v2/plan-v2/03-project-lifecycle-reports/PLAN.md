# 03 · PLAN — Project Lifecycle & Reports

> Contrato de **execucao** da funcionalidade `03`. Deriva da SPEC aprovada
> (`03/SPEC.md`). Define a ordem de implementacao em etapas (batches), cada uma com
> arquivos tocados, done criteria observaveis e gates de verificacao. **A SPEC e a
> fonte de verdade do comportamento; este PLAN e a fonte de verdade da execucao.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `03/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convencoes e gotchas).

## 1. Escopo

Cobre: (1) `periodType` fechado em enum `ProjectPeriod` (WEEKLY/MONTHLY/SEMESTER/
YEARLY/WHOLE_PROJECT) + `projects.startedAt DateTime?` + migracao versionada com
backfill de legado; (2) ancoragem de periodos relativos e camada pura de agregacao por
periodo **reutilizando as primitivas da consolidacao semanal (RF-43)**; (3) endpoints
agregadores (`/api/projects/[id]/reports/periods`, `/period`, `/generate`) + RBAC nova
(`VIEW_ALL_REPORTS`) com espelho em feature flags; (4) **contrato** da brochura PDF
(DTO + port), render real `blocked` ate o template (D-03-01); (5) testes e gates.

Fora de escopo (ver SPEC §10): renderer de PDF real, mudanca em `weekly_reports`,
consolidacao semanal RF-43, notificacoes novas.

## 2. Dependencias

- Do PLAN-v2: `01-roles-permissions` (baseline RBAC estavel; `03` adiciona a chave
  `VIEW_ALL_REPORTS` **sem reabrir** as matrizes existentes) e `02-logging-audit`
  (trilha para consumir na geracao futura de relatorios; nao bloqueia a data layer).
  No `STATE.json`: `dependencies.list = ["01", "02"]`, `allDone = false`.
- De runtime/infra: Postgres (`docker compose up -d postgres` para G4/G5), Prisma
  migracao versionada, moedor `reporting` existente, storage `lib/storage/report-uploads`.
- De schema: `enum ProjectPeriod` + `projects.startedAt` — ambos criados na Etapa 1.
- Bloques externo: template de brochura PDF (D-03-01) — render em `blocked`.

## 3. Etapas de implementacao (ordem obrigatoria)

Cada etapa e um **lote atomico** com evidencia observavel. Nunca avance sobre lote
vermelho.

### Etapa 1 — Enum `ProjectPeriod` + `startedAt` + migracao de normalizacao (AC-03-01/02/13)

**Objetivo** — Fechar `periodType` no enum, adicionar `startedAt` e criar a migracao
versionada com backfill deterministico de legado; reconciliar as **duas** fontes TS de
periodicidade em uma unica (`lib/constants/report-periods.ts`). Sem `db push`.

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                                   (enum ProjectPeriod; periodType ProjectPeriod linha 199; startedAt DateTime? em projects ~linha 56; unique/index permanecem)
- prisma/migrations/<timestamp>_project_period_enum/migration.sql  (generado + backfill SQL + dedup D-03-05)
- lib/constants/report-periods.ts                        (ReportPeriodType vira ProjectPeriod; REPORT_PERIOD_TYPES/isReportPeriodType/computePeriod atualizados; + resolveProjectAnchor; + computeRelativePeriod; caso WHOLE_PROJECT)
- backend/modules/reporting/application/contracts.ts     (linha 106 passa a importar ProjectPeriod de lib/constants — remover tipo duplicado)
- backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts  (cast em createProjectReport ~767; isReportPeriodType -> ProjectPeriod; WHOLE_PROJECT sem reference)
- app/api/project-reports/route.ts                       (validacao linhas 39/86 via enum; WHOLE_PROJECT ignora reference)
- tests/unit/lib/constants/report-periods.test.ts        (NOVO: enum, computePeriod, anchor, relative, whole)
```

**Mudancas de schema:** `enum ProjectPeriod { WEEKLY MONTHLY SEMESTER YEARLY WHOLE_PROJECT }`
(PRISMA); `projects.startedAt DateTime?`; `project_reports.periodType ProjectPeriod`
(antes `String`). Migracao: troca de tipo com `USING`; backfill
`weekly->WEEKLY`, `monthly->MONTHLY`, `semiannual->SEMESTER`, `annual->YEARLY`;
`biweekly->MONTHLY` com dedup deterministico (menor id vence) ANTES do `UNIQUE`
(D-03-05 — confirmar com dono antes de rodar em prod).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC1.1 — `npx prisma migrate dev --name project_period_enum` gera migracao
      versionada; `migrate status` sem drift; **nenhum** `db push` (G5).
- [ ] DC1.2 — `schema.prisma` sem `periodType String` (grep zero fora do comentario);
      `projects.startedAt DateTime?` presente.
- [ ] DC1.3 — `contracts.ts` nao exporta mais `ProjectReportPeriodType` proprio
      (`ProjectReportPeriodType` = alias/re-export de `ProjectPeriod`); unica fonte em
      `lib/constants/report-periods.ts` (grep `"weekly" | "biweekly"` = 0 fora do
      mapeamento legado da migracao).
- [ ] DC1.4 — legado normalizado: query de integracao (ou SQL de evidencia) mostra
      contagens mapeadas e dedup; nenhuma linha com valor forado enum (AC-03-01/13).
- [ ] DC1.5 — `resolveProjectAnchor`: usa `startedAt`; senao menor `work_sessions.
      startTime` do projeto; senao menor `daily_logs.date`; senao erro tipado
      (AC-03-02). `computeRelativePeriod` cobre "Semana N"/"Mes N" (AC-03-03).
- [ ] DC1.6 — `npx tsc --noEmit` 0 errors; `npx vitest run` suite `report-periods`
      verde; G3 global continua 256/257 + novos.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run` ·
`docker compose up -d postgres && npx prisma migrate dev` (G4/G5: toca schema/DB).

### Etapa 2 — Camada de agregacao por periodo (AC-03-04/05)

**Objetivo** — Agregado puro + gateway que calcula janela por periodo **derivado da
primitiva semanal** (duration/3600 das sessoes completadas, startOfWeek segunda) e
inclui task stats e breakdown por usuario, com paridade opcional contra
`weekly_hours_history`. Nenhuma consolidacao paralela (D-03-04).

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/reporting/application/period/period-aggregation.ts   (NOVO, puro sem I/O: indexPeriods(window primitives), aggregateShape, hoursByUser, parity semanal)
- backend/modules/reporting/application/ports/reporting.gateway.ts     (metodo aggregateProjectPeriod(projectId, window) no port — linha ~90)
- backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts (aggregateProjectPeriod: generaliza o bloco de aggregateProjectReport:902-928 + task stats + breakdown; WHOLE_PROJECT usa anchor)
- backend/modules/reporting/application/contracts.ts                   (normalize ProjectPeriodAggregateResult + tarefa)
- backend/modules/reporting/index.ts                                   (facade expoe aggregateProjectPeriod)
- tests/unit/backend/reporting/period-aggregation.test.ts              (NOVO: janela->agregado; paridade; horas por usuario soma = total)
```

**Mudancas de schema (se houver):** nenhuma nesta etapa.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC2.1 — `period-aggregation.ts` e pura (sem import de prisma/repositorio);
      `indexPeriods` deriva janelas de `computePeriod`/`listPeriods`.
- [ ] DC2.2 — para cada janela, `totalHours` bate com soma de `duration`/3600
      (precisao centesimal) e, quando `weekly_hours_history` cobre a janela por inteiro,
      o agregado concorda com a soma dos snapshots (AC-03-04).
- [ ] DC2.3 — `hoursByUser` soma == `totalHours`; `taskStats` por `status`/
      `taskVisibility` com contagem e `points` (AC-03-05).
- [ ] DC2.4 — `aggregateProjectPeriod` nao persiste nada (so leitura);
      `aggregateProjectReport` existente segue verde (nao-regressao).
- [ ] DC2.5 — `npx tsc --noEmit` 0 errors; suite `period-aggregation` e as existentes
      do reporting verdes.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run`.

### Etapa 3 — Endpoints agregadores + RBAC `VIEW_ALL_REPORTS` (AC-03-05/06/07/11)

**Objetivo** — Expor `periods`/`period`/`generate` com autorizacao da SPEC (RF-03-EXT-5)
e adicionar `VIEW_ALL_REPORTS` em `rbac.ts` + espelho em `features.ts` (paridade). O
`generate` constroi o DTO de relatorio final (produz 200/501 conforme a Etapa 4).

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/auth/rbac.ts                       (PERMISSIONS.VIEW_ALL_REPORTS — set proposto [COORDENADOR, GERENTE, LABORATORISTA]; ratificar D-03-07)
- lib/auth/features.ts                   (FEATURE_ACCESS.VIEW_ALL_REPORTS = mesmo set)
- backend/modules/reporting/infrastructure/prisma-reporting.gateway.ts (asserts: view = MANAGE_USERS|VIEW_ALL_REPORTS|lider; generate = lider|COORDENADOR|GERENTE; ~660-684)
- app/api/projects/[id]/reports/periods/route.ts      (NOVO: GET listar janelas; parametros periodType/from/to; 400 em invalidos)
- app/api/projects/[id]/reports/period/route.ts       (NOVO: GET agregado da janela via aggregateProjectPeriod)
- app/api/projects/[id]/reports/generate/route.ts     (NOVO: POST callback do use-case da Etapa 4)
- tests/unit/backend/reporting/reporting-rbac.test.ts (NOVO: matriz view/generate)
- tests/unit/backend/reporting/period-routes.test.ts  (NOVO: 401/400/403/200/501)
- tests/unit/lib/auth/features-parity.test.ts         (NOVO: VIEW_ALL_REPORTS rbac x features)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — `VIEW_ALL_REPORTS` identico em `rbac.ts` e `features.ts`
      (features-parity verde, AC-03-11).
- [ ] DC3.2 — view: `MANAGE_USERS` | `VIEW_ALL_REPORTS` (staff) | lider do projeto ->
      200; VOLUNTARIO/nao-autorizado -> 403; sem sessao -> 401 (AC-03-06).
- [ ] DC3.3 — generate: so lider do projeto, COORDENADOR ou GERENTE; `GERENTE_PROJETO`
      de outro projeto e VOLUNTARIO -> 403 (AC-03-07). Sem regra de negocio nas rotas
      (assercoes no gateway).
- [ ] DC3.4 — `/periods` e `/period` respondem com labels pt-BR e janela correta;
      `periodType`/`from`/`to` invalidos -> 400 (AC-03-05).
- [ ] DC3.5 — `npx tsc --noEmit` 0 errors; suites novas verdes; G3 sem regressao
      (256/257 + novos).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run`.

### Etapa 4 — Contrato da brochura PDF (DTO + port); render `blocked` (AC-03-09)

**Objetivo** — Entregar o **contrato** de dados do PDF (input DTO tipado + port
`BrochureRenderer`), build do DTO pela camada de agregacao e renderer placeholder que
lanca `BrochureTemplateUnavailableError` (501) ate o template chegar. O render real NAO
e implementado nesta versao (D-03-01).

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/reporting/application/contracts.ts                    (tipos BrochureRenderInput/BrochureRenderOutput: projeto, periodo, membros, task stats por status, horas por usuario/periodo, top conquistas)
- backend/modules/reporting/application/ports/brochure-renderer.port.ts (NOVO: render(input): Promise<BrochureRenderOutput>)
- backend/modules/reporting/application/use-cases/generate-project-report.use-case.ts (NOVO: agrega WHOLE_PROJECT e monta BrochureRenderInput; chama port)
- backend/modules/reporting/infrastructure/pending-template-brochure-renderer.ts     (NOVO: lanca BrochureTemplateUnavailableError; status 501)
- backend/modules/reporting/index.ts              (createReportingModule aceita brochureRenderer opcional; default placeholder)
- app/api/projects/[id]/reports/generate/route.ts  (liga o use-case; mapeia 501)
- tests/unit/backend/reporting/brochure-dto.test.ts        (NOVO: golden shape do DTO)
- tests/unit/backend/reporting/generate-report.test.ts     (NOVO: fake renderer recebe DTO e devolve bytes)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC4.1 — `BrochureRenderInput` cobrindo: resumo do projeto (incl. anchor), periodo
      (label/start/end), membros, `taskStats` por status com points, `hoursByUser` e
      sessoes/logs agregados — publico, sem campos de segredo.
- [ ] DC4.2 — `generate` constroi o DTO via `aggregateProjectProject` (WHOLE_PROJECT) e,
      com o placeholder, responde **501** com corpo estavel (`template indisponivel`)
      sem falhar o build (AC-03-09).
- [ ] DC4.3 — com `fake renderer` injetado, `generate` retorna os bytes e o port recebe
      exatamente o DTO validado (json matcher), sem tocar Prisma no renderer.
- [ ] DC4.4 — blocker registrado no STATE com acao do dono (entregar template); milestone
      de render fica `blocked`, data layer continua (D-03-01).
- [ ] DC4.5 — `npx tsc --noEmit` 0 errors; suites `brochure-dto`/`generate-report` verdes.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run`.

### Etapa 5 — Testes de integracao + gates finais (AC-03-01/04/12/13)

**Objetivo** — Fechar a verificacao com DB real (migracao/backfill, roundtrip de
agregado x weekly_hours_history), anti-scatter de single-source e registrar tudo no
`STATE.json`. Decidir previamente com o dono: ratificar D-03-05 (biweekly) e D-03-07
(set de `VIEW_ALL_REPORTS`).

**Arquivos a criar/alterar (caminhos completos):**

```
- tests/integration/period-migration-backfill.test.ts   (environment node, DB real em localhost:5432)
- tests/integration/period-reporting-roundtrip.test.ts  (environment node, DB real)
- plan-v2/03-project-lifecycle-reports/STATE.json        (evidencias, gates, ACs, blockers, decisions, timeline)
```

**Mudancas de schema (se houver):** nenhuma nesta etapa (migracao ja versionada na 1;
rodar `prisma migrate dev` de novo se houver drift detectado em G5).

**Done criteria desta etapa (todas observaveis):**
- [ ] DC5.1 — backfill de integracao: contagens mapeadas/dedup confirmadas (AC-03-13);
      coluna enum aceita apenas os 5 valores (AC-03-01).
- [ ] DC5.2 — roundtrip: `aggregateProjectPeriod(MONTHLY)` == soma dos
      `weekly_hours_history` da janela e das sessoes (AC-03-04); export CSV e
      report-files com periodo novo respondem (AC-03-12).
- [ ] DC5.3 — G1..G5 verdes na ordem canonica; G3 = 256/257 + novos unit
      (~10-12) + 2 integration verdes.
- [ ] DC5.4 — `STATE.json` com ACs mapeadas, `gates` finais, `evidence[]`, blockers
      (template PDF + ratificacoes pendentes) e timeline.

**Gates desta etapa:** checklist da secao 4 abaixo.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (256/257; unico fail conhecido floating-session-timer)
docker compose up -d postgres && npx vitest run                                # G4 (integration: backfill + roundtrip)
npx prisma migrate dev || npx prisma migrate deploy                            # G5 (sem db push; sem drift)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para `STATE.json` (secao `rollbacks`) — motivo + acao tomada.
- Rollback de migracao: reverter `schema.prisma` + `npx prisma migrate dev` com downgrade
  local; **nunca** editar uma migracao ja aplicada (nova migracao corrige); em prod,
  `migrate resolve --rolled-back` so quando previsto no deploy.

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `03` como `done`:

- [ ] Todos os gates (G1–G5; G4/G5 aplicaveis — toca schema/DB) verdes
- [ ] Todas as AC-03-01..AC-03-13 da SPEC com teste/evidencia mapeada
- [ ] Migracao versionada (`project_period_enum`) sem `db push`
- [ ] Single-source de periodicidade: grep anti-scatter `"biweekly"|"semiannual"` = 0 no codigo runtime (so no backfill da migracao)
- [ ] Render de brochura documentado `blocked` no STATE com acao do dono (template)
- [ ] `STATE.json` atualizado (eventos, evidencias, rollbacks, decisions, blockers)