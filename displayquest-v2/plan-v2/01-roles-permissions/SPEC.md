# 01 · SPEC — roles-permissions

> Contrato de **comportamento** da funcionalidade `01`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.

## 1. Proposito

O DisplayQuest ja tem RBAC (papeis globais em `users.roles`, papeis por projeto em
`project_members.roles`, lider por `projects.leaderId`) e fluxo de aprovacao de tarefas
(RF-27/RF-28). Porem a autoridade de aprovacao **nao distingue** quem e o dono da task:
hoje o lider de projeto pode **aprovar a propria task** (auto-aprovacao) e a negacao de
autorizacao retorna HTTP 500. Esta funcionalidade **divide a autoridade de aprovacao**:
lider aprova/rejeita apenas tasks de staff do proprio projeto; a task do proprio lider
so e aprovada por gestores (detentores de `MANAGE_TASKS` alem do lider). Sem mudancas de
schema nem das matrizes de papeis existentes — e um contrato de permissao derivado do
RBAC que ja existe, espelhado entre backend (autoridade) e UI (feature flags).

## 2. Contexto atual (linha de base)

Fatos verificados no codigo (linha de base da feature):

- **RBAC nucleo** (`lib/auth/rbac.ts`): `PERMISSIONS.MANAGE_USERS = [COORDENADOR, GERENTE]`
  (linha 16), `PERMISSIONS.MANAGE_TASKS = [COORDENADOR, GERENTE, GERENTE_PROJETO,
  COLABORADOR, PESQUISADOR]` (linha 23). **Nao existe papel `ADMIN`** — o topo e
  `COORDENADOR`/`GERENTE`.
- **Feature flags** (`lib/auth/features.ts`): `FEATURE_ACCESS.MANAGE_TASKS` (linha 11)
  com o mesmo set do RBAC; o client re-exporta via `lib/utils/access-control.ts`
  (`hasAccess`, `ACCESS_CONTROL = FEATURE_ACCESS`).
- **Guards** (`lib/auth/api-guard.ts`): `requireApiActor` (linha 17), `ensurePermission`
  (linha 40), `ensureAnyRole` (linha 47), `ensureSelfOrPermission` (linha 54). O ator e
  `ApiActor { id, roles }` com roles `normalizeRoles` das roles globais da sessao.
- **Autoridade de aprovacao HOJE** (`backend/modules/task-management/infrastructure/
  task-service.gateway.ts`): em `approveTask` (linhas 522-583) e `rejectTask`
  (linhas 585-632) vale: `canApproveAnyTask = hasPermission(roles, "MANAGE_USERS")` OU
  `canApproveProjectTask = hasAnyRole(["GERENTE_PROJETO"]) && task.projectId != null &&
  project.leaderId === approverId`. **Gap**: nao ha checagem de dono vs lider → o lider
  **auto-aprova a propria task**; nao ha distincao entre "task de staff" e "task do lider".
- **HTTP** (`app/api/tasks/[id]/approve/route.ts` e `[id]/reject/route.ts`): `catch`
  generico devolve **500** mesmo para negacao de autorizacao. Contrasta com o precedente
  `toHttpStatus` em `app/api/projects/[id]/members/route.ts:10-25`, que mapeia mensagens
  `"Acesso negado"`/`"Apenas"` → 403.
- **Precedente de restricao do lider** (`task-service.gateway.ts:464-470`): lider ja nao
  pode **concluir** a propria task ("Lideres de projeto nao podem concluir suas proprias
  tasks"). O gap e nas acoes de **aprovar/rejeitar**, que hoje sao o caminho de fuga.
- **Schema** (`prisma/schema.prisma`): `users.roles UserRole[]` (linha 21),
  `projects.leaderId Int?` (linha 56), `project_members.roles UserRole[]` (linha 73),
  `tasks.assignedTo Int?` (linha 86), `tasks.projectId Int?` (linha 87). Nada a migrar.
- **RFs da visao** (`docs/APOO/04-requisitos-funcionais.md`): RF-05 (linha 12,
  aprovar/rejeitar contas), RF-07 (linha 17, papeis globais), RF-16 (linha 29, papeis do
  membro no projeto), RF-17 (linha 30, designar lider), RF-27 (linha 43, aprovar tarefa),
  RF-28 (linha 44, rejeitar tarefa).

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| `COORDENADOR` | Gestor amplo (MANAGE_USERS) | Aprova/rejeita qualquer task, incl. global e task do lider |
| `GERENTE` | Gestor amplo (MANAGE_USERS) | Idem COORDENADOR |
| `GERENTE_PROJETO` | Lider de projeto (`projects.leaderId`) | Aprova/rejeita **staff tasks** do proprio projeto; nunca a propria |
| `GERENTE_PROJETO` (sem MANAGE_USERS) | Gestor de outro projeto | Pode aprovar task de lider X via pool `MANAGE_TASKS` (decisao D1) |
| `COLABORADOR`, `PESQUISADOR` | Detentores de `MANAGE_TASKS` | Pool de gestao da task do proprio lider |
| `LABORATORISTA` | Sem MANAGE_TASKS/MANAGE_USERS | Nao aprova nem rejeita tarefas (nenhum caminho) |
| `VOLUNTARIO` | Sem MANAGE_TASKS/MANAGE_USERS | Nao aprova nem rejeita tarefas |
| `USUARIO` (sem roles) | Apenas autenticado | Nao aprova nem rejeita; 403 |

## 4. Requisitos funcionais

### RF-01.01 — Dividir autoridade de aprovacao (staff × lider)

- **Descricao:** o lider de projeto aprova/rejeita apenas tasks de staff no proprio
  projeto: `task.projectId` pertence a um projeto cujo `projects.leaderId === actorId` e
  o dono da task (`tasks.assignedTo`) **nao** e o lider.
- **Fronteira:** `backend/modules/task-management` (policy de dominio).
- **Entradas/Saidas:** `POST /api/tasks/[id]/approve` e `POST /api/tasks/[id]/reject`;
  200 (task `done`/`adjust`) ou 403.
- **Cenario principal (Gherkin):**
  ```
  Given um projeto P com lider L, uma task T de staff S (assignedTo = S) em in-review
  When  L envia POST /api/tasks/[id]/approve
  Then  a resposta e 200, T fica done e S recebe os pontos (award preservado)
  ```
- **Regras de negocio:** (1) lider com `GERENTE_PROJETO` precisa ser `projects.leaderId`
  do projeto de T; (2) se `task.assignedTo === project.leaderId`, o ramo de lideranca e
  negado (auto-aprovacao proibida); (3) task sem `projectId` (global) nao entra no ramo
  de lideranca.

### RF-01.02 — Proibir auto-aprovacao do lider

- **Descricao:** lider **nunca** aprova nem rejeita a propria task em in-review.
- **Fronteira:** policy de dominio (`approval-policy.ts`) aplicada em
  `approveTask`/`rejectTask`.
- **Entradas/Saidas:** mesma rota; resultado 403 com mensagem estavel.
- **Cenario principal (Gherkin):**
  ```
  Given um projeto P com lider L e a task T do proprio L (assignedTo = L) em in-review
  When  L envia POST /api/tasks/[id]/approve
  Then  a resposta e 403, T permanece in-review e nenhum ponto e concedido
  ```
- **Regras de negocio:** (1) o ramo `A2` exige `taskOwnerId !== projectLeaderId`;
  (2) o ramo `A3` (pool de gestores) exige `actorId !== taskOwnerId`, o que remove o
  proprio lider mesmo quando ele detem `MANAGE_TASKS`.

### RF-01.03 — Gestores aprovam a task do proprio lider

- **Descricao:** a task do lider so e aprovada/rejeitada por gestores — detentores de
  `MANAGE_TASKS` **alem do lider** (pool `A3`) ou `MANAGE_USERS` (pool `A1`).
- **Fronteira:** policy de dominio.
- **Entradas/Saidas:** mesma rota; 200 quando o ator for gestor, 403 caso contrario.
- **Cenario principal (Gherkin):**
  ```
  Given a task T do lider L em in-review e um ator A com MANAGE_TASKS e A != L
  When  A envia POST /api/tasks/[id]/approve
  Then  a resposta e 200, T fica done e L recebe os pontos
  ```
- **Regras de negocio:** (1) o pool `A3` e global (nao exige membership no projeto),
  consistente com `MANAGE_TASKS` ser permissao global — decisao D1; (2) award e
  notificacoes (`TASK_APPROVED`/`TASK_REJECTED`) permanecem inalterados.

### RF-01.04 — Manter aprovacao de task global inalterada

- **Descricao:** task global (`isGlobal`/sem `projectId`) continua aprovavel apenas por
  `MANAGE_USERS` (COORDENADOR/GERENTE) — mesmo comportamento de hoje.
- **Fronteira:** policy de dominio.
- **Entradas/Saidas:** mesma rota.
- **Cenario principal (Gherkin):**
  ```
  Given uma task global T em in-review
  When  um GERENTE_PROJETO C (sem MANAGE_USERS) envia POST approve
  Then  a resposta e 403
  When  um COORDENADOR envia POST approve
  Then  a resposta e 200
  ```
- **Regras de negocio:** ramo `A1` e o unico valido para `taskProjectId == null`.

### RF-01.05 — Rejeicao espelha aprovacao (paridade)

- **Descricao:** `rejectTask` usa exatamente a mesma policy de `approveTask`; nao existe
  autorizacao divergente entre os verbos.
- **Fronteira:** `task-service.gateway.ts:585-632`.
- **Entradas/Saidas:** `POST /api/tasks/[id]/reject` com `{ reason }`; 200 → status
  `adjust` + linha `FIX (data): motivo` no description (comportamento atual preservado);
  403 quando a autoridade falhar.
- **Cenario principal (Gherkin):**
  ```
  Given uma task T de staff S em in-review e o lider L
  When  L envia POST /api/tasks/[id]/reject com reason "revisar escopo"
  Then  a resposta e 200, T fica adjust e o description ganha a linha FIX
  Given a task T do lider L
  When  L envia POST /api/tasks/[id]/reject
  Then  a resposta e 403
  ```
- **Regras de negocio:** paridade total de decisao; payload `reason` opcional e sem
  impacto na autorizacao.

### RF-01.06 — Negacao vira HTTP 403 com mensagem estavel

- **Descricao:** negacao de autorizacao em approve/reject responde **403** (nao 500),
  com `body.error` estavel e identico entre os dois verbos.
- **Fronteira:** rotas `app/api/tasks/[id]/approve` e `app/api/tasks/[id]/reject`;
  erro tipado `TaskAuthorizationError` (status 403).
- **Entradas/Saidas:** erro tipado lancado pelo gateway; rotas traduzem para
  `NextResponse.json({ error }, { status: 403 })`.
- **Cenario principal (Gherkin):**
  ```
  Given um ator sem autoridade para a task
  When  a rota approve ou reject e chamada
  Then  a resposta tem status 403 e body.error presente e estavel
  ```
- **Regras de negocio:** nenhuma regra de negocio nova nas rotas — elas apenas mapeiam
  o erro tipado do dominio.
## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Seguranca | Decisao de autorizacao e unica, em policy de dominio pura (approval-policy), never nas rotas | Teste unit cobre a matriz completa; review de rota nao contem `hasPermission` novo |
| Seguranca | Default-deny: ator sem match em A1/A2/A3 e negado | AC-05: nao-aprovador recebe 403 |
| Confiabilidade | Negacao de autorizacao retorna 403 (nao 500) e nao muta a task | AC-08 + teste de rota |
| Manutenibilidade | approve e reject compartilham a mesma policy (single source) | AC-06: paridade; teste de gateway com os dois verbos |
| Compatibilidade | Nenhuma mudanca de schema nem de `PERMISSIONS`; RF-05/07/16/17 intactos | AC-11 + G3 sem regressao (256/257 + novos) |
| Observabilidade | Cada AC tem evidencia de teste; STATE.json registra gates e rollbacks | ARCHITECTURE gating |
| Performance | No maximo 1 lookup extra de `projects` por request (ja existia para aprovacao) | Sem alteracao de complexidade; testes nao medem regressao |

## 6. Modelo de dados (se aplicavel)

**Nenhuma mudanca.** Decisao registrada no `STATE.json` (`decisions[]`): a autoridade de
aprovacao e **derivada** de campos que ja existem no `prisma/schema.prisma`:

- `projects.leaderId Int?` (linha 56) — designacao de lider (RF-17), ja usada por
  `assign-project-leader.use-case.ts`.
- `tasks.assignedTo Int?` (linha 86) — dono da task (RF-22). "Task do lider" =
  `tasks.assignedTo === projects.leaderId`.
- `tasks.projectId Int?` (linha 87) — escopo da task no projeto.
- `project_members.roles UserRole[]` (linha 73) — papeis por projeto (RF-16): **nao**
  decidem aprovador nesta versao (decisao D2); permanecem como dado de atribuicao.
- `users.roles UserRole[]` (linha 21) — papeis globais (RF-07), base dos pools.

Consequencias: G4/G5 do processo **nao se aplicam** (sem toque em schema/DB); `db push`
e proibido e nao ha migracao a versionar. Somente `npx prisma generate` se o client foi
regenerado (nao esperado — sem mudanca de modelo).

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados

| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| POST | `/api/tasks/[id]/approve` | **Alterado**: autoridade passa a respeitar owner × lider; negacao → 403 | `MANAGE_USERS` (global) OU `MANAGE_TASKS` (task do lider, ≠ lider) OU lider do projeto (staff task) |
| POST | `/api/tasks/[id]/reject` | **Alterado**: mesma policy do approve; negacao → 403 | idem approve |
| POST | `/api/users/approve` | Inalterado (baseline RF-05, `ensurePermission(MANAGE_USERS)` — `app/api/users/approve/route.ts:9,24`) | `MANAGE_USERS` |
| PATCH | `/api/users/[id]` | Inalterado (baseline RF-07, papeis globais) | `MANAGE_USERS` |
| POST | `/api/projects/[id]/members` | Inalterado (baseline RF-16/RF-17: `add`/`remove`/`set_roles`/`set_leader`) | regras atuais do membership module |

Os quatro "inalterado" sao **nao-regressao** (AC-11): a feature nao toca esses contratos.

### 7.2 Eventos de dominio publicados/consumidos

| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `TASK_REVIEW_REQUEST` | task-management | notifications | Inalterado (quem marca in-review) |
| `TASK_APPROVED` | task-management | notifications | Inalterado (emissao so quando aprovacao de fato ocorre) |
| `TASK_REJECTED` | task-management | notifications | Inalterado |
| `onTaskCompleted` (gamificacao) | task-management | gamification | Inalterado (award S/L ao aprovar) |

Nenhum evento novo e publicado — a divisao de autoridade muda **quem** pode disparar os
eventos existentes, nao os eventos.

## 8. Casos de teste / evidencia esperada

Novos testes (unit, sob `tests/unit/**` — incluidos pelo `vitest.config.mts`):

```
- tests/unit/modules/task-management/approval-policy.test.ts          -> matriz pura A1/A2/A3 (AC-01..AC-07)
- tests/unit/modules/task-management/task-approval-rbac.gateway.test.ts -> gateway com mocks de repositorio (AC-01..AC-07, 403 e 200)
- tests/unit/modules/task-management/approve-reject.routes.test.ts    -> rotas com vi.mock de getBackendComposition (AC-08)
- tests/unit/lib/auth/features-parity.test.ts                         -> FEATURE_ACCESS x PERMISSIONS + APPROVE_TASKS (AC-09)
- tests/unit/lib/utils/task-approval-ui.test.ts                       -> mirror UI x policy (AC-10)
```

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **256/257 de base** (unico fail conhecido `floating-session-timer`)
  + todos os testes novos verdes
- G4/G5 — **n/a** (nenhum toque em schema/DB/infra)

Ao final, a contagem unit esperada e: 256/257 (baseline) + numero de testes novos verdes,
sem nenhum fail alem do conhecido.

## 9. Acceptance criteria (definitivos e rastreaveis)

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-01 | Given projeto P com lider L e task T de staff S em in-review; When L faz POST approve; Then 200, T fica done e S recebe pontos | approval-policy.test.ts + task-approval-rbac.gateway.test.ts | RF-01.01 / RF-27 |
| AC-02 | Given projeto P com lider L e task T de L (assignedTo=L) em in-review; When L faz POST approve; Then 403, T permanece in-review, sem award | task-approval-rbac.gateway.test.ts | RF-01.02 / RF-27 |
| AC-03 | Given task T de L em in-review; When COORDENADOR/GERENTE (MANAGE_USERS) faz approve; Then 200, done, L recebe pontos | task-approval-rbac.gateway.test.ts | RF-01.03 / RF-27 |
| AC-04 | Given task T de L em in-review; When ator A com MANAGE_TASKS e A != L faz approve; Then 200, done | approval-policy.test.ts | RF-01.03 / RF-27 |
| AC-05 | Given task T em in-review e ator sem MANAGE_USERS/MANAGE_TASKS e nao-lider; When A faz approve ou reject; Then 403 e T inalterada | approval-policy.test.ts + routes | RF-01.01/RF-01.06 |
| AC-06 | Given task T de L; When L faz POST reject; Then 403; Given staff task; When L rejeita com reason; Then 200 e T fica adjust com linha FIX | task-approval-rbac.gateway.test.ts | RF-01.05 / RF-28 |
| AC-07 | Given task global em in-review; When GERENTE_PROJETO sem MANAGE_USERS aprova; Then 403; When COORDENADOR aprova; Then 200 | approval-policy.test.ts | RF-01.04 / RF-27 |
| AC-08 | Given qualquer negacao de autorizacao; When a rota approve/reject responde; Then status 403, body.error estavel e igual nos dois verbos | approve-reject.routes.test.ts | RF-01.06 |
| AC-09 | Given FEATURE_ACCESS e PERMISSIONS; Then MANAGE_TASKS identico entre rbac.ts e features.ts e APPROVE_TASKS presente com set = MANAGE_TASKS | features-parity.test.ts | RF-01.07 / RF-07 |
| AC-10 | Given lib/utils/task-approval-ui.ts; Then para a matriz de casos responde igual a isTaskApprover | task-approval-ui.test.ts | RF-01.07 |
| AC-11 | Given fluxos existentes RF-05 (aprovar contas), RF-07 (papeis globais), RF-16 (papeis projeto), RF-17 (designar lider); When a feature entra; Then mesmas permissoes exigidas, sem mudanca de schema e unit = 256/257 + novos verdes | G1–G3 + suites existentes | RF-01.08 |

## 10. Fora de escopo (desta versao)

- Alterar matrizes `PERMISSIONS`/`FEATURE_ACCESS` existentes (menos adicionar `APPROVE_TASKS`).
- Autorizacao baseada em `project_members.roles` (papel por projeto) para decidir aprovador.
- Multiplos lideres por projeto ou hierarquia alem de `projects.leaderId`.
- Reescrita da UI de permissoes/gestao de usuarios (RF-05/07/16/17 stays as-is).
- Recompensa/gamificacao por ato de aprovar.
- SSO/LDAP e multi-lab (features 05/06 do plan-v2).
- Transacoes de banco nos use-cases (fora da fronteira desta feature).

## 11. Dependencias e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| nenhuma | — | Sem dependencia do plan-v2 |
| decisao do dono: pool A3 = "MANAGE_TASKS alem do lider" | decisao de negocio | Resolvida (ver `decisions[]` D1) |
| `floating-session-timer` (fail conhecido) | teste legado | Nao bloqueador (baseline 256/257) |
