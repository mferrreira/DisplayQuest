# 03 · SPEC — Project Lifecycle & Reports

> Contrato de **comportamento** da funcionalidade `03`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.

## 1. Proposito

O DisplayQuest ja tem relatorio semanal por usuario (RF-39..43) e relatorios por
periodo salvos na tabela `project_reports`, mas **sem requisito funcional** que cubra
relatorios periodicos (mes/semestre/ano/projeto-completo) endossados para a vida do
projeto, tampouco a **brochura final em PDF**. Esta funcionalidade fecha esse buraco:
transforma `periodType` em **enum fechado** (`ProjectPeriod`), introduz **ancoragem de
periodos relativos** (`projects.startedAt` com fallback para a atividade mais antiga),
cria a **camada de agregacao por periodo** que reutiliza as primitivas de consolidacao
semanal (RF-43), expoe **endpoints agregadores** com RBAC novo (`VIEW_ALL_REPORTS`) e
define o **contrato de dados da brochura PDF** (render fica `blocked` ate o template do
dono chegar — decisao D-03-01). Tudo sobre o moedor `reporting` existente.

## 2. Contexto atual (linha de base)

Fatos verificados no codigo (baseline desta feature):

- **Schema** (`prisma/schema.prisma`): `project_reports` na linha 195 com `periodType
  String` (linha 199, **string livre**), `periodStart`/`periodEnd` DateTime,
  `@@unique([projectId, periodType, periodStart, authorId])` (linha 210) e
  `@@index([projectId, periodType])` (linha 211); `report_attachments` na linha 214.
  `projects` (linha 50) tem `leaderId` (linha 56) e `createdAt String` (linha 54) —
  **nao existe `startedAt`**.
- **Periodicidade TS** (`lib/constants/report-periods.ts`): `ReportPeriodType = "weekly"
  | "biweekly" | "monthly" | "semiannual" | "annual"` (linha 1) com
  `REPORT_PERIOD_TYPES` (3), `isReportPeriodType` (11), `computePeriod` (78, janelas
  horas-civis America/Sao_Paulo UTC-3) e `listPeriods` (140). **Existe um tipo
  duplicado** em `backend/modules/reporting/application/contracts.ts:106`
  (`ProjectReportPeriodType`, mesmas 5 variantes). Nenhum caso para `WHOLE_PROJECT`.
- **Moedor reporting** (`backend/modules/reporting/index.ts:35-61`): create/update/
  delete/get/list/aggregate project report + register/delete attachment, todos
  gateway-backed; use-cases semanais (RF-39..43) em
  `application/use-cases/{upsert,list,get-weekly-report-by-id,delete-weekly-report}.use-case.ts`.
- **Gateway** (`prisma-reporting.gateway.ts`): `isManagementRole` = so
  `hasPermission(MANAGE_USERS)` (linha 660); `assertCanCreateOnProject` = gestao OU
  lider (672); `assertCanViewProjectReports` = gestao OU lider (680);
  `aggregateProjectReport` (902) agrega janela por `daily_logs` + `work_sessions`
  (linha 913-923, `duration/3600`); `createProjectReport` (752) valida
  `isReportPeriodType` (760) e computa janela via `computePeriod` (767);
  `notifyManagersOfSubmission` (724) emite `PROJECT_REPORT_SUBMITTED`.
- **Rotas** (`app/api/project-reports/`): `route.ts` (GET list/POST create + upload,
  valida `periodType` nas linhas 39/86), `[id]/route.ts` (29: usa `getProjectReport`),
  `[id]/aggregate/route.ts` (25: `aggregateProjectReport`), `[id]/attachments/route.ts`,
  `[id]/export.csv/route.ts` (19: consome `aggregateProjectReport`). Arquivos servidos
  por `app/api/report-files/[...path]/route.ts` (58: regra de acesso =
  `getProjectReport`; mime `application/pdf` suportado na linha 19).
- **Dados disponiveis para agregacao**: `tasks` (linha 80: status 84, assignedTo 86,
  projectId 87, points 89, completed 90, taskVisibility 92, `task_user_progress` 118),
  `work_sessions` (267), `daily_logs` (170), `weekly_hours_history` (316: userId,
  weekStart, weekEnd, totalHours), `weekly_reports` (183), `project_reports`,
  `history` (248).
- **Consolidacao semanal (RF-43)**: `createWeeklyHoursHistory` (gateway 410) e rotinas
  de fechamento usam `startOfWeek(..., { weekStartsOn: 1 })` + `endOfWeek` e somam
  `duration`/3600 de `work_sessions.status = "completed"` por usuario — as **primitivas
  que a agregacao por periodo deve reutilizar** (D-03-04).
- **RBAC** (`lib/auth/rbac.ts:10-23`): `GERENTE_PROJETO`, `COORDENADOR`, `GERENTE`,
  `COLABORADOR`, `PESQUISADOR`, `LABORATORISTA`, `VOLUNTARIO`; manutencoes de gestao
  por `MANAGE_USERS`/`MANAGE_PROJECTS`/`MANAGE_TASKS`. **Nao existe `VIEW_ALL_REPORTS`**
  (nem em `features.ts`). Label `GERENTE_PROJETO = "Gerente de Projeto"` em
  `server-auth.ts:75`.
- **RFs da visao** (`docs/APOO/04-requisitos-funcionais.md:61-65`): RF-39 (registrar/
  atualizar relatorio semanal), RF-40 (consultar relatorios semanais), RF-41 (recuperar
  por id), RF-42 (excluir), RF-43 (consolidacoes de horas semanais Wx). Ja
  implementados (moedor reporting).

**Lacunas identificadas:** (1) `periodType` livre (String) permite valores arbitrarios
e nao cobre `WHOLE_PROJECT`; (2) dois types TS divergentes de periodicidade; (3) sem
RF funcional para relatorios periodicos de projeto (mes/semestre/ano/completo) nem
para brochura final PDF; (4) sem `startedAt` para ancorar periodos relativos ("Semana
N do projeto"); (5) `aggregateProjectReport` nao considera tasks nem rastreia
paridade com `weekly_hours_history`; (6) sem permission de leitura ampla (`VIEW_ALL_REPORTS`).

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| `GERENTE_PROJETO` (lider) | `projects.leaderId` | Lista/ve relatorios do proprio projeto; **gera** relatorio final do projeto; cria/edita os proprios |
| `COORDENADOR` / `GERENTE` | Gestao ampla (`MANAGE_USERS`) | Ve relatorios de qualquer projeto; **gera** relatorio final; notifica-se em submissao |
| Staff com `VIEW_ALL_REPORTS` | Permissao nova (set proposto: `COORDENADOR`, `GERENTE`, `LABORATORISTA` — ver D-03-07) | Lista/ve relatorios sem poderes de gestao |
| `COLABORADOR` / `PESQUISADOR` / `VOLUNTARIO` | Operadores | Sem acesso a view ampla nem geracao; upload de attachments e escrita propria como hoje |
| `LABORATORISTA` | Staff de lab | Se incluido no set de `VIEW_ALL_REPORTS` (D-03-07), ve; nao gera |
| Sistema / cron | Ator tecnico | Nao se aplica nesta feature (sem escrita automatica nova) |

## 4. Requisitos funcionais

> RF-39..43 (base da visao) estao **implementados** e sao **nao-regressivos** aqui. Os
> requisitos novos desta feature recebem o sufixo `EXT` (extensao).

### RF-39 — Relatorio semanal salvo pelo usuario (herdado, baseline)

- **Descricao:** `upsert-weekly-report` persiste `weekly_reports` (weekStart/weekEnd/
  totalLogs/summary). **Inalterado.**
- **Regras:** nao tocar; nao regredir (AC-03-10).

### RF-40 — Listar semanas (baseline) / RF-41 — Editar, deletar e recuperar por id (baseline)

- **Descricao:** uso via use-cases proprios + CRUD de `project_reports`. **Inalterado;
  a mudanca de enum nao altera esses fluxos** (AC-03-10, AC-03-12).

### RF-42 — Consultar por usuario (baseline)

- **Descricao:** filtro `authorId` em `list-project-reports`. **Inalterado.**
  (AC-03-06 exercita a mesma rota com a nova RBAC.)

### RF-43 — Consolidar horas semanais Wx (baseline)

- **Descricao:** consolidacao semanal por `weekly_hours_history`, primitiva reutilizada
  pela agregacao por periodo (D-03-04). **Mantida; nao ha consolidacao paralela nova.**
  (AC-03-04/AC-03-05.)

### RF-03-EXT-1 — periodType fechado em enum `ProjectPeriod`

- **Descricao:** `periodType` vira enum nao-nulo `WEEKLY | MONTHLY | SEMESTER |
  YEARLY | WHOLE_PROJECT` com migracao versionada que **normaliza legado** (ver §6).
  `Weekly`, `monthly`, `semiannual` e `annual` legados mapeiam; `biweekly` segue regra
  D-03-05.
- **Fronteira:** `prisma/schema.prisma` + `lib/constants/report-periods.ts` (unica
  fonte de periodicidade TS; `contracts.ts:106` passa a importar dela).
- **Cenario principal (Gherkin):**
  ```
  Given a tabela project_reports com linhas legadas periodType = "weekly"
  When  a migracao versionada roda (migrate dev/deploy)
  Then  todos os registros legados ficam com enum valido, sem db push, migrate status sem drift
  ```
- **Regras de negocio:** (1) `WHOLE_PROJECT` nunca usa `reference` como inicio — usa o
  anchor do projeto (§6); (2) valores fora do enum → 400 nas rotas de escrita;
  (3) `@@unique([projectId, periodType, periodStart, authorId])` permanece.

### RF-03-EXT-2 — Ancoragem de periodos relativos (`projects.startedAt`)

- **Descricao:** `projects.startedAt DateTime?` (opcional). Periodos relativos
  ("Semana N do projeto", "Mes N do projeto") sao janelas calendar-relativas ao anchor:
  `startedAt` quando presente; senao `weekStart` da atividade mais antiga registrada no
  projeto (menor `work_sessions.startTime`, depois menor `daily_logs.date`), ambas
  normalizadas por `startOfWeek` (segunda). Projeto sem nenhuma atividade e sem
  `startedAt` nao tem periodos relativos (erro tipado).
- **Fronteira:** `lib/constants/report-periods.ts` (`resolveProjectAnchor`,
  `computeRelativePeriod`) + gateway (resolve anchor).
- **Cenario principal (Gherkin):**
  ```
  Given projeto P com startedAt = 2026-01-05 (segunda) e atividade logada desde 2026-01-06
  When  o periodo relativo "Semana 3 do projeto" e computado
  Then  a janela vai de 2026-01-26 a 2026-02-01 (America/Sao_Paulo)
  Given projeto Q sem startedAt, atividade mais antiga em 2026-02-11 (quarta)
  When  o anchor de Q e resolvido
  Then  anchor = segunda da semana de 2026-02-11 (2026-02-09) e "Mes 1" parte daqui
  ```
- **Regras de negocio:** anchor resolve uma unica vez por projeto por request; fallback
  deterministico item a item (D-03-06).

### RF-03-EXT-3 — Agregacao por periodo reutilizando primitivas semanais

- **Descricao:** agregado de periodo (mes/semestre/ano/projeto-completo) calculado pela
  **mesma primitiva semanal** de RF-43/`aggregateProjectReport`: sum de `duration/3600`
  de `work_sessions` e de logs por janela. Inclui, alem do atual (logs + sessoes),
  **task stats** (contagem e `points`/`progress` por `status`/`taskVisibility`) e
  **breakdown de horas por usuario** com paridade opcional contra `weekly_hours_history`
  quandosnapshots cobrem a janela inteira.
- **Fronteira:** `backend/modules/reporting/application/period/` (calculadora pura) +
  gateway (`aggregateProjectPeriod`) + facade.
- **Cenario principal (Gherkin):**
  ```
  Given janela mensal de marco/2026 no projeto P
  When  aggregateProjectPeriod(P, MONTHLY, marco/2026) roda
  Then  totalHours = soma das sessoes completadas na janela e
        taskStats > 0 e hoursByUser soma(por usuario) = totalHours
  ```
- **Regras de negocio:** (1) nenhuma segunda consolidacao paralela — sempre derivado da
  primitiva semanal (D-03-04); (2) `WHOLE_PROJECT` usa `[anchor, agora/ultima atividade]`;
  (3) agregado de periodo e **somente leitura** — nao persiste `project_reports`.

### RF-03-EXT-4 — Leitura de janelas e exportacao por periodo

- **Descricao:** o cliente pode listar as janelas de um tipo (`computePeriod`/
  `listPeriods`) e obter o agregado de uma janela. Export CSV existente passa a cobrir
  os novos tipos (janela + task stats).
- **Cenario principal (Gherkin):**
  ```
  Given projeto P autenticado como lider
  When  GET /api/projects/[id]/reports/periods?periodType=MONTHLY&from=2026-01&to=2026-03
  Then  retorna as 3 janelas mensais com label em pt-BR ("janeiro/2026", ...)
  ```

### RF-03-EXT-5 — RBAC: `VIEW_ALL_REPORTS` + geracao restrita

- **Descricao:** nova permission `VIEW_ALL_REPORTS` (RBAC + feature flag espelho).
  Listar/ver: `MANAGE_USERS` OU `VIEW_ALL_REPORTS` OU lider do projeto (`leaderId`).
  **Gerar** relatorio final: **somente** lider do projeto OU `COORDENADOR` OU `GERENTE`.
  Upload de attachments: regra atual (`assertCanCreateOnProject` = gestao OU lider),
  inalterada.
- **Fronteira:** gateways + rotas; `rbac.ts` + `features.ts`.
- **Cenario principal (Gherkin):**
  ```
  Given lider L de P, staff S com VIEW_ALL_REPORTS, voluntario V, e gerente G de outro projeto
  When  L e S e G fazem GET /api/projects/[id]/reports/period
  Then  L e S retornam 200; G retorna 200 se VIEW_ALL_REPORTS, senao 403
  When  L, COORDENADOR ou GERENTE chamam POST /api/projects/[id]/reports/generate
  Then  200 (DTO construido); GERENTE_PROJETO de outro projeto e VOLUNTARIO -> 403
  ```
- **Regras de negocio:** default-deny; `GERENTE_PROJETO` sem ser lider do projeto nao
  gera nem amplia view sem `VIEW_ALL_REPORTS` (D-03-03).

### RF-03-EXT-6 — Contrato da brochura final em PDF (render `blocked`)

- **Descricao:** contrato tipado `BrochureRenderInput` (DTO) construido pela camada de
  agregacao e port `BrochureRenderer` (render de template). O **render real fica
  `blocked`** ate o template de PDF ser fornecido (D-03-01): o wire passa a usar um
  renderer placeholder que lanca `BrochureTemplateUnavailableError` (HTTP 501) e o DTO
  e a assinatura do port sao testados com fake.
- **Cenario principal (Gherkin):**
  ```
  Given template de brochura INDISPONIVEL
  When  POST /api/projects/[id]/reports/generate
  Then  o DTO e construido/validado e a resposta e 501 (template pendente), sem PDF
  Given template DISPONIVEL (futuro)
  When  o mesmo POST roda
  Then  renderer recebe o DTO valido (fake em teste) e retorna bytes do PDF
  ```
- **Regras de negocio:** o DTO e a fonte de dados do render; nenhuma regra de negocio
  no renderer; `brochure-renderer` nunca toca Prisma (recebe tudo pronto).

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Seguranca | Decisao de autorizacao unica nas assercoes do petition (gestao/view/generate) e default-deny | AC-03-06/AC-03-07; testes de rota |
| Compatibilidade | Migracao versionada normaliza legado sem `db push`; zero drift | AC-03-01/AC-03-13 + G5 |
| Integridade de dados | Backfill deterministico com dedup documentado (menor id vence; contagens registradas) | AC-03-13; evidencia no STATE |
| Confiabilidade | Um anchor por request; erro tipado para projeto sem atividades | AC-03-02; unit |
| Manutenibilidade | Fonte **unica** de periodicidade (`lib/constants/report-periods.ts`); `contracts.ts` nao duplica | grep anti-scatter (AGENT) |
| Manutenibilidade | Nenhuma consolidacao paralela: agregacao deriva de primitivas de RF-43 | AC-03-04 (paridade) |
| Performance | Agregacao usa as mesmas queries indexadas de hoje; janela filtrada por `periodStart` | sem alteracao de complexidade; testes nao medem regressao |
| Observabilidade | Render de brochura expoe estado `blocked`/template ausente por erro tipado 501 | AC-03-09 + STATE blockers |

## 6. Modelo de dados (se aplicavel)

**Nova tabela/alteracoes em `prisma/schema.prisma`:**

```prisma
enum ProjectPeriod {
  WEEKLY
  MONTHLY
  SEMESTER
  YEARLY
  WHOLE_PROJECT
}

model projects {
  // ...
  startedAt DateTime?  // ancoragem de periodos relativos (RF-03-EXT-2)
}

model project_reports {
  // ...
  periodType ProjectPeriod  // antes String (era linha 199)
  // @@unique([projectId, periodType, periodStart, authorId]) permanece (linha 210)
  // @@index([projectId, periodType]) permanece (linha 211)
}
```

**Migracao versionada (G5, sem `db push`):** criar enum Postgres, trocar a coluna com
`USING (periodType::text)::"ProjectPeriod"` e **backfill SQL dentro da mesma migracao**:

1. `weekly -> WEEKLY`, `monthly -> MONTHLY`, `semiannual -> SEMESTER`,
   `annual -> YEARLY`.
2. `biweekly` (legado sem alvo no enum): mapeia para `MONTHLY`; antes do `UNIQUE`, faz
   dedup deterministico em `(projectId, periodType, periodStart, authorId)` mantendo a
   **menor id** e descartando as duplicatas — contagens de afetados registradas como
   evidencia no STATE (D-03-05; ratificacao do dono pendente).
3. `periodStart` de janelas `WHOLE_PROJECT` futuras passa a ser o anchor resolvido
   (nunca a data de creation da UI).

Sem backfill para `startedAt` (coluna nova nullable; consumidores usam fallback
RF-03-EXT-2). Consequencia: G4/G5 **aplicaveis** nas etapas que tocam schema.

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados

| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| GET | `/api/projects/[id]/reports/periods?periodType&from&to` | **Novo**: lista janelas (`computePeriod`/`listPeriods`) com labels pt-BR | `MANAGE_USERS` OU `VIEW_ALL_REPORTS` OU lider do projeto |
| GET | `/api/projects/[id]/reports/period?periodType&reference\|nth` | **Novo**: agregado da janela (sessoes + logs + task stats + breakdown) | idem acima |
| POST | `/api/projects/[id]/reports/generate` | **Novo**: gera relatorio final (agregado WHOLE_PROJECT + DTO brochura; 501 sem template) | lider do projeto OU `COORDENADOR` OU `GERENTE` |
| GET | `/api/project-reports/[id]/aggregate` | **Alterado**: aceita os novos periodTypes e inclui task stats no payload (retro) | regra atual (`getProjectReport`) |
| POST | `/api/project-reports` | **Alterado**: `periodType` em `ProjectPeriod`; `WHOLE_PROJECT` ignora `reference` | regra atual (`assertCanCreateOnProject`) |
| GET | `/api/project-reports` | **Alterado**: filtro `periodType` em `ProjectPeriod` (resto inalterado) | RBAC RF-03-EXT-5 |
| PATCH/DELETE | `/api/project-reports/[id]`, `[id]/attachments` | Inalterados | regras atuais |
| GET | `/api/project-reports/[id]/export.csv` | Inalterado (agora cobre novos tipos) | atual (`aggregateProjectReport`) |
| GET | `/api/report-files/[...path]` | Inalterado (acesso via `getProjectReport`; `application/pdf` ja suportado) | `getProjectReport` |

### 7.2 Eventos de dominio publicados/consumidos

| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `PROJECT_REPORT_SUBMITTED` | reporting (`notifyManagersOfSubmission`, gateway 724) | notifications | Inalterado (emissao em create de `project_reports`) |
| — | — | — | Nenhum evento novo; geracao de relatorio final nao publica evento nesta versao |

## 8. Casos de teste / evidencia esperada

Novos testes (unit sob `tests/unit/**`, integration sob `tests/integration/**`):

```
- tests/unit/lib/constants/report-periods.test.ts         (enum, computePeriod novos, relative, whole)
- tests/unit/backend/reporting/period-aggregation.test.ts (janela -> agregado; paridade semanal)
- tests/unit/backend/reporting/brochure-dto.test.ts       (golden shape do BrochureRenderInput)
- tests/unit/backend/reporting/reporting-rbac.test.ts     (VIEW_ALL_REPORTS + generate, default-deny)
- tests/unit/backend/reporting/period-routes.test.ts      (periods/period/generate: 401/400/403/200/501)
- tests/unit/lib/auth/features-parity.test.ts             (VIEW_ALL_REPORTS rbac x features)
- tests/integration/period-reporting-roundtrip.test.ts    (DB real: agregado por periodo x weekly_hours_history)
- tests/integration/period-migration-backfill.test.ts     (DB real: normalizacao + dedup + constraint enum)
```

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **256/257 de base** (unico fail conhecido `floating-session-timer`)
  + todos os novos testes verdes
- G4 `docker compose up -d postgres && npx vitest run` — integration do DB
- G5 `npx prisma migrate dev` (local) / `deploy` (prod) — **sem `db push`**

Contagem esperada ao final: baseline 256/257 + ~10 a 12 unit novos + 2 integration verdes.

## 9. Acceptance criteria (definitivos e rastreaveis)

Cada AC: **observavel**, **testavel por terceiro**, com referencia a teste/evidencia.

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-03-01 | Given `project_reports` com legado livre; When migracao versionada roda; Then `periodType` vira enum `ProjectPeriod` valido, legado normalizado (weekly→WEEKLY etc.), sem `db push` e `migrate status` sem drift | `period-migration-backfill.test.ts` + G5 | RF-03-EXT-1 / RF-40 |
| AC-03-02 | Given projeto com `startedAt`; When anchor resolvido; Then usa `startedAt` normalizado; sem `startedAt`, usa `weekStart` (segunda) da atividade mais antiga; sem atividades => erro tipado | `report-periods.test.ts` (resolveProjectAnchor) | RF-03-EXT-2 |
| AC-03-03 | Given anchor conhecido; When "Semana 3 do projeto"/"Mes 2 do projeto" computados; Then janela calendar-relativa correta em America/Sao_Paulo | `report-periods.test.ts` (computeRelativePeriod) | RF-03-EXT-2 |
| AC-03-04 | Given janela de mes/semestre/ano/completo; When `aggregateProjectPeriod` roda; Then `totalHours` = soma de `duration/3600` das sessoes completadas na janela e, com snapshot completo, == soma de `weekly_hours_history`; `hoursByUser` soma = total | `period-aggregation.test.ts` + integration roundtrip | RF-03-EXT-3 / RF-43 |
| AC-03-05 | Given periodType MONTHLY/SEMESTER/YEARLY/WHOLE_PROJECT; When endpoint de periodo responde; Then janela, label pt-BR, logs, sessoes, task stats e breakdown retornados | `period-routes.test.ts` + `period-aritmetica` unit | RF-03-EXT-3/4 |
| AC-03-06 | Given ator X em GET de periodos/period; Then `MANAGE_USERS` ou `VIEW_ALL_REPORTS` ou lider -> 200; VOLUNTARIO e nao-autorizado -> 403/401 (default-deny) | `reporting-rbac.test.ts` + `period-routes.test.ts` | RF-03-EXT-5 / RF-40 / RF-42 |
| AC-03-07 | Given POST generate; Then lider do projeto, COORDENADOR e GERENTE -> DTO (200); GERENTE_PROJETO de outro projeto e VOLUNTARIO -> 403 | `reporting-rbac.test.ts` + `period-routes.test.ts` | RF-03-EXT-5 |
| AC-03-08 | Given membro/gestor com a regra atual; When upload de attachment; Then autorizado como hoje (gestao OU lider); regra inalterada | suite existente de attachments + G3 | RF-39 / RF-41 |
| AC-03-09 | Given template de brochura ausente; When generate; Then DTO valido construido e resposta 501 (`BrochureTemplateUnavailableError`); com fake renderer, port recebe DTO e devolve bytes | `brochure-dto.test.ts` + fake renderer | RF-03-EXT-6 / D-03-01 |
| AC-03-10 | Given fluxos RF-39..43 (weekly upsert/list/get/delete + consolidacao semanal); When a feature entra; Then sem regressao e baseline unit = 256/257 + novos verdes | suites existentes + G3 | RF-39..43 |
| AC-03-11 | Given `PERMISSIONS.VER_*`; Then `VIEW_ALL_REPORTS` existe e e identico entre `rbac.ts` e `features.ts` | `features-parity.test.ts` | RF-03-EXT-5 |
| AC-03-12 | Given relatorio em periodType novo (incl. WHOLE_PROJECT); When export CSV ou report-files; Then responde normalmente (CSV com janela e task stats; arquivos via `getProjectReport`) | `period-routes.test.ts` + suite report-files | RF-41 |
| AC-03-13 | Given linhas biweekly/semiannual legadas; When backfill de migracao; Then convertidas/deduplicadas de forma deterministico (menor id vence) com contagens registradas como evidencia | `period-migration-backfill.test.ts` + STATE evidence | RF-03-EXT-1 |

## 10. Fora de escopo (desta versao)

- **Renderer de PDF real** (template) — bloqueado por D-03-01 ate o dono fornecer o
  template; esta v0 entrega o contrato (DTO + port).
- Remover/renomear o model `weekly_reports`; mudar a consolidacao semanal RF-43.
- Relatorios financeiros, de kilometragem ou de custo por membro.
- Escrita/manutencao de relatorios periodicos por nao-gerente (apenas leitura da camada
  de agregacao; o que grava `project_reports` continua sendo o fluxo atual).
- Notificacoes novas de geracao de relatorio final.
- Purga/retention de `project_reports`.
- Multi-lab e SSO/LDAP (features 05/06).

## 11. Dependencias e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| 01-roles-permissions (RBAC estavel para a nova permission) | dep do plan-v2 | pendente (consumo: `VIEW_ALL_REPORTS` nova chave, sem reabrir matrizes) |
| 02-logging-audit (trilha de auditoria para geracao de relatorio futuro) | dep do plan-v2 | pendente (sem bloqueio para a data layer) |
| Postgres local ligado (G4/integration roundtrip) | runtime | `docker compose up -d postgres` |
| **Template de brochura em PDF** | **bloqueador externo (owner)** | **`blocked`** ate o dono entregar o template; data layer + contrato DTO seguem (D-03-01) |
| Ratificacao: mapeamento do legado `biweekly` (D-03-05) e set de `VIEW_ALL_REPORTS` (D-03-07) | decisao de dono | proposta; confirmar antes da Etapa 1/3 (registrada em `checks[]`) |
| `floating-session-timer` (fail conhecido) | teste legado | nao bloqueador (baseline 256/257) |