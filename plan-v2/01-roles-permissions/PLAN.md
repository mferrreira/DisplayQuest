# 01 · PLAN — roles-permissions

> Contrato de **execucao** da funcionalidade `01`. Deriva da SPEC aprovada
> (`01/SPEC.md`). Define a ordem de implementacao em etapas (batches), cada uma com
> arquivos tocados, done criteria observaveis e gates de verificacao. **A SPEC e a
> fonte de verdade do comportamento; este PLAN e a fonte de verdade da execucao.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `01/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convencoes e gotchas).

## 1. Escopo

Cobre a **divisao de autoridade de aprovacao de tarefas** (RF-27/RF-28) e a **paridade
backend→UI** das feature flags, dentro do que ja existe de RBAC. Assume como baseline
ja implementado (nao reescreve): aprovacao/rejeicao de contas pendentes (RF-05 via
`app/api/users/approve/route.ts` + `MANAGE_USERS`), atribuicao de papeis globais
(RF-07), papeis por projeto (RF-16 via `project_members.roles`) e designacao de lider
(RF-17 via `projects.leaderId`).

Fora de escopo (ver SPEC §10): alterar as matrizes `PERMISSIONS`/`FEATURE_ACCESS` de
papeis ja existentes, mudar schema, implementar autorizacao baseada em
`project_members.roles` para decidir aprovador, ou reescrever UI de permissoes.

## 2. Dependencias

- Do PLAN-v2: nenhuma (feature `01` e raiz; `dependencies.list = []` no STATE).
- De runtime/infra: nenhuma nova — reutiliza `identityAccess` (ja injetado no modulo
  task-management via `backend/composition/root.ts:39-45`) e `projectRepository` (ja
  dentro de `task-service.gateway.ts`). Sem endpoint, cron, upload ou servico externo novo.
- De schema: nenhuma. `projects.leaderId`, `tasks.assignedTo`, `tasks.projectId`,
  `users.roles` e `project_members.roles` ja existem no `prisma/schema.prisma`.

## 3. Etapas de implementacao (ordem obrigatoria)

Cada etapa e um **lote atomico** com evidencia observavel. Nunca avance sobre lote
vermelho.

### Etapa 1 — Manifestar o gap atual de aprovacao (leitura/rastreio)

**Objetivo** — Congelar, como evidencia, o comportamento atual do
`approveTask`/`rejectTask` e o drift de autorizacao que motivou a funcionalidade:
lider de projeto pode auto-aprovar a propria task e negacao de autorizacao retorna
HTTP 500 nas rotas. Nenhum codigo de producao e alterado.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/01-roles-permissions/SPEC.md            (secao 2 "Contexto atual": inventario do gap com file:line)
- plan-v2/01-roles-permissions/STATE.json         (evidencia "gap-manifest" registrada)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC1.1 — `SPEC.md` §2 cita o comportamento atual com file:line reais:
      `backend/modules/task-management/infrastructure/task-service.gateway.ts:522-552`
      (approve) e `:585-615` (reject): hoje vale `canApproveAnyTask = MANAGE_USERS`
      OU (`GERENTE_PROJETO` e `project.leaderId === approverId`), sem checagem de
      dono (owner) vs lider — ou seja, o lider auto-aprova a propria task.
- [ ] DC1.2 — `SPEC.md` §2 registra o drift de status: `app/api/tasks/[id]/approve/route.ts`
      e `app/api/tasks/[id]/reject/route.ts` tem `catch` generico que devolve 500 para
      negacao de autorizacao (o contraste e o precedente `toHttpStatus`
      em `app/api/projects/[id]/members/route.ts:10-25`).
- [ ] DC1.3 — Nenhum arquivo de producao alterado (`git status` mostra apenas
      `plan-v2/01-roles-permissions/`).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json plan-v2/01-roles-permissions/SPEC.md` · `npx tsc --noEmit` (baseline 0 errors) · `npx vitest run` (baseline 256/257; unico fail conhecido `floating-session-timer`).

### Etapa 2 — Definir o contrato de permissao de aprovacao no dominio (backend)

**Objetivo** — Criar a politica pura e testavel de autoridade de aprovacao, unica
fonte de verdade para approve e reject. Nao altera as matrizes `PERMISSIONS`
(`lib/auth/rbac.ts`) — a autoridade e derivada de `MANAGE_USERS`, `MANAGE_TASKS`,
`GERENTE_PROJETO` + relacao `projects.leaderId` × `tasks.assignedTo`.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/task-management/application/approval-policy.ts   (NOVO: pure function, sem I/O)
- tests/unit/modules/task-management/approval-policy.test.ts       (NOVO: matriz de casos)
```

**Mudancas de schema (se houver):** nenhuma.

**Contrato a implementar (decisao registrada no STATE `decisions[]`):**

```
isTaskApprover(context): TaskApprovalDecision
context = { actorId, actorRoles, taskOwnerId, taskProjectId, projectLeaderId }

A1 (MANAGE_USERS):     actor detem MANAGE_USERS                 -> allowed true (qualquer task, incl. global)
A2 (PROJECT_LEADER):   actor detem GERENTE_PROJETO E
                       taskProjectId != null E projectLeaderId === actorId E
                       taskOwnerId !== projectLeaderId          -> allowed true (staff task do proprio projeto)
A3 (MANAGE_TASKS):     taskOwnerId === projectLeaderId E
                       actor detem MANAGE_TASKS E
                       actorId !== taskOwnerId                  -> allowed true (task do lider so por gestor alem do lider)
senao                                                           -> allowed false (TaskAuthorizationError)
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC2.1 — `approval-policy.ts` exporta `isTaskApprover` pura (sem import de prisma/
      repositorio; tipada com `Role[]` de `lib/auth/rbac`).
- [ ] DC2.2 — `approval-policy.test.ts` cobre a matriz completa: A1 (incl. task global),
      A2 (staff ok / propria negada / nao-lider negado), A3 (gestor aprova task do lider;
      ator com MANAGE_TASKS ≠ lider), e default-deny para qualquer outro ator.
- [ ] DC2.3 — Testes verdes em isolamento: `npx vitest run tests/unit/modules/task-management/approval-policy.test.ts`.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/task-management/application/approval-policy.ts tests/unit/modules/task-management/approval-policy.test.ts` · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/task-management/approval-policy.test.ts`.

### Etapa 3 — Implementar no modulo task-management (gateway + rotas → 403)

**Objetivo** — Fazer `approveTask` e `rejectTask` delegarem a `isTaskApprover` e as
duas rotas mapearem negacao como HTTP 403 (era 500). O amarra a autoridade no codigo
real nos tres planos observaveis: dominio (gateway), HTTP (rotas) e evidencia (testes
de gateway e de rota).

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/task-management/application/errors.ts                      (NOVO: TaskAuthorizationError com status 403)
- backend/modules/task-management/infrastructure/task-service.gateway.ts     (approveTask:522-583 e rejectTask:585-632 usam isTaskApprover; resolvem projectLeaderId via projectRepository e taskOwnerId via task.assignedTo)
- app/api/tasks/[id]/approve/route.ts                                        (catch mapeia TaskAuthorizationError -> 403)
- app/api/tasks/[id]/reject/route.ts                                         (idem)
- tests/unit/modules/task-management/task-approval-rbac.gateway.test.ts      (NOVO: mocks de repositorio, AC-01..AC-07)
- tests/unit/modules/task-management/approve-reject.routes.test.ts           (NOVO: mock de getBackendComposition, AC-08)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — `approveTask` e `rejectTask` produzem o mesmo resultado de autorizacao
      (paridade): mesmos 3 ramos, mesma mensagem de erro para os dois verbos.
- [ ] DC3.2 — Lider aprova task de staff do proprio projeto (AC-01) e **nao** aprova a
      propria (AC-02); GERENTE (MANAGE_USERS) aprova task do lider (AC-03); ator com
      MANAGE_TASKS ≠ lider aprova task do lider (AC-04); nao-aprovador e negado (AC-05);
      task global so via MANAGE_USERS (AC-07).
- [ ] DC3.3 — Rotas devolvem **403 com mensagem estavel** em negacao (AC-08) em vez de 500;
      casos de sucesso mantem 200 e o fluxo de pontos (award via `publishTaskCompletionAward`
      e notificacoes `TASK_APPROVED`/`TASK_REJECTED`) intacto.
- [ ] DC3.4 — Nenhuma regra de negocio nova nas rotas: elas apenas traduzem o erro
      tipado; nenhuma dependencia nova fora do composition root.
- [ ] DC3.5 — `approve-task.use-case.ts`/`reject-task.use-case.ts` permanecem delgados
      (sem logica); gateway continua recebendo deps via `createTaskManagementModule`/
      `createTaskManagementGateway` (sem mudar `backend/composition/root.ts`).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/task-management/application/errors.ts backend/modules/task-management/infrastructure/task-service.gateway.ts app/api/tasks/[id]/approve/route.ts app/api/tasks/[id]/reject/route.ts tests/unit/modules/task-management/task-approval-rbac.gateway.test.ts tests/unit/modules/task-management/approve-reject.routes.test.ts` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 4 — Espelhar feature flags na UI (features.ts + client + painel)

**Objetivo** — Paridade backend→UI mantendo as flags existentes: `FEATURE_ACCESS`
ganha `APPROVE_TASKS` (set = `MANAGE_TASKS`), a UI client passa a ter um mirror puro
da policy (`lib/utils/task-approval-ui.ts`) e o painel (`ModernAdminPanel`) usa esse
mirror para exibir/ocultar os botoes Aprovar/Rejeitar. **Enforcement continua 100% no
backend** (SPEC §2.6): a UI apenas espelha.

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/auth/features.ts                    (ADICIONA APPROVE_TASKS = [COORDENADOR, GERENTE, GERENTE_PROJETO, COLABORADOR, PESQUISADOR])
- lib/utils/task-approval-ui.ts           (NOVO: canActorApproveTaskUI, mirror client-sem-side-effect da policy)
- components/admin/ModernAdminPanel.tsx   (gate dos botoes em "isInReview" com o mirror; linhas 701-747)
- tests/unit/lib/auth/features-parity.test.ts            (NOVO)
- tests/unit/lib/utils/task-approval-ui.test.ts          (NOVO)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC4.1 — `FEATURE_ACCESS.MANAGE_TASKS` continua identico a `PERMISSIONS.MANAGE_TASKS`
      e `APPROVE_TASKS` existe com o mesmo set (features-parity.test.ts).
- [ ] DC4.2 — `canActorApproveTaskUI` responde igual a `isTaskApprover` para a mesma
      matriz de casos (paridade via teste com tabela compartilhada; AC-10).
- [ ] DC4.3 — Painel nao regride: para ator sem `APPROVE_TASKS` os botoes Aprovar/Rejeitar
      ficam ocultos; para ator com `APPROVE_TASKS` continuam visiveis em tasks in-review.
- [ ] DC4.4 — `lib/utils/access-control.ts` (re-export `hasAccess`) continua funcionando
      com a nova key sem mudanca de codigo.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json lib/auth/features.ts lib/utils/task-approval-ui.ts components/admin/ModernAdminPanel.tsx tests/unit/lib/auth/features-parity.test.ts tests/unit/lib/utils/task-approval-ui.test.ts` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 5 — Testes completos + gates finais (fecha AC-11)

**Objetivo** — Rodar a verificacao completa em cadeia, confirmar regressao zero das
baselines (RF-05/07/16/17) e registrar tudo no `STATE.json`.

**Arquivos a criar/alterar (caminhos completos):**

```
- tests/unit/modules/task-management/approval-policy.test.ts      (revisar, amarrar com AC-01..AC-07)
- tests/unit/modules/task-management/task-approval-rbac.gateway.test.ts
- tests/unit/modules/task-management/approve-reject.routes.test.ts
- plan-v2/01-roles-permissions/STATE.json                          (evidencias, gates, ACs, timeline)
- (sem schema -> G5 registrado como "n/a" no STATE)
```

**Mudancas de schema (se houver):** nenhuma — G5 `n/a`, sem `db push`.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC5.1 — G1 verde (exit 0) para todos os arquivos alterados.
- [ ] DC5.2 — G2 verde (`npx tsc --noEmit`, 0 errors).
- [ ] DC5.3 — G3 verde: baseline **256/257** (unico fail conhecido
      `floating-session-timer`) + todos os testes novos verdes.
- [ ] DC5.4 — Suites existentes de RF-05/07/16/17 sem regressao (AC-11): testes de
      `app/api/users/approve`, papeis globais, membros/lider de projeto seguem verdes.
- [ ] DC5.5 — `STATE.json` atualizado: `acceptanceCriteria` todas com `status`
      (pending/verified), `gates` com resultado final, `evidence[]` com os comandos e
      saidas, timeline com os eventos implementados.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (256/257; unico fail conhecido floating-session-timer)
# G4/G5 n/a: nenhum toque em schema/DB/infra (sem migrate, sem db push)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para o cache em `STATE.json` (secao `rollbacks`) — motivo + acao tomada.

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `01` como `done`:

- [ ] Todos os gates (G1–G3; G4/G5 `n/a` registrado) verdes
- [ ] Todas as AC-01..AC-11 da SPEC com teste/evidencia mapeada
- [ ] Migracoes versionadas: nenhuma (sem schema change) — nunca `db push`
- [ ] STATE.json atualizado (eventos, evidencias, rollbacks, decisions)