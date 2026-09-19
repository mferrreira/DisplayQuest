# 02 · PLAN — Logging & Audit centralizado

> Contrato de **execução** da funcionalidade `02`. Deriva da SPEC aprovada
> (`02/SPEC.md`). Define a ordem de implementação em etapas (batches), cada uma com
> arquivos tocados, done criteria observáveis e gates de verificação. **A SPEC é a
> fonte de verdade do comportamento; este PLAN é a fonte de verdade da doação.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `02/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convenções e gotchas).

## 1. Escopo

- Criar a trilha de auditoria **centralizada** (nova tabela `audit_logs`) com **UM**
  escritor único (`audit` module) plugado no composition root (`backend/composition/root.ts`)
  e injetado nos módulos sensíveis (task-management, project-management,
  project-membership, user-management, store, work-execution).
- Cobrir: aprovação/rejeição de tasks, gestão de membros/roles, CRUD de projetos,
  rewards/purchases, work sessions (finalização/delete) e issues.
- Consulta de auditoria via endpoint HTTP com filtros + RBAC (`COORDENADOR`/`GERENTE`).
- Imutabilidade: trigger SQL bloqueia `UPDATE`/`DELETE` em `audit_logs`.
- **NÃO cobre**: migrar/remover a tabela `history`, purgar logs, nem auditar lab notices
  (ficam em `history`). Fora de escopo na SPEC seção 10.

## 2. Dependências

- Do PLAN-v2: nenhuma — `02` é paralelizável com `01` (dependencies `[]` no state.json global).
- De runtime/infra: Postgres (`docker compose up -d postgres` para G4/integração),
  Prisma migrações versionadas, Next.js API routes existentes.

## 3. Etapas de implementação (ordem obrigatória)

Cada etapa é um **lote atômico** com evidência observável. Nunca avance sobre lote
vermelho.

### Etapa 1 — Modelo `AuditLog` no schema + migração versionada

**Objetivo**: criar `model audit_logs` (append-only) com índices e trigger de imutabilidade
via migração Prisma versionada (sem `db push`).

**Arquivos a criar/alterar (caminhos completos):**
```
- prisma/schema.prisma
- prisma/migrations/<timestamp>_add_audit_logs/migration.sql   (gerado + trigger + índices)
```

**Mudanças de schema:** nova tabela `audit_logs` (id Int PK autoincrement, entityType String,
entityId Int, action String, actorId Int? FK users SET NULL, actorLabel String, performedAt
DateTime @default(now()), changedFrom Json?, changedTo Json?, description String?, metadata
Json?); relação `auditLogs` em `users`; índices `[entityType, entityId, performedAt]`,
`[action, performedAt]`, `[actorId, performedAt]`, `[performedAt]`; trigger
`audit_logs_immutable` (BEFORE UPDATE OR DELETE → RAISE EXCEPTION).

**Done criteria desta etapa (todas observáveis):**
- [ ] DC1.1 — `npx prisma migrate dev --name add_audit_logs` cria migração versionada sem `db push` (G5).
- [ ] DC1.2 — `prisma generate` atualiza o client; `prisma.audit_logs` tipado (G2 `npx tsc --noEmit` 0 errors).
- [ ] DC1.3 — `migration.sql` contém o trigger e os 4 índices (grep no arquivo gerado, sem edição manual extra além do SQL trigger).
- [ ] DC1.4 — `npx prisma migrate status` sem drift (0 migrations pending).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json prisma/schema.prisma` (exit 0) ·
`npx tsc --noEmit` · `npx prisma migrate dev`

### Etapa 2 — Módulo `audit`: port + gateway Prisma + use-cases

**Objetivo**: criar `backend/modules/audit` espelhando a arquitetura dos demais módulos
(application/ports/use-cases + infrastructure/gateway + index.ts factory), com o port
`AuditLogWriter` injetável e três use-cases: `record-audit-event`, `list-audit-events`,
`get-entity-history`.

**Arquivos a criar/alterar (caminhos completos):**
```
- backend/modules/audit/application/contracts.ts         (AuditEventRecord, ListAuditEventsQuery, ActionCatalog)
- backend/modules/audit/application/action-catalog.ts    (entity types + actions permitidos — fonte de verdade TS)
- backend/modules/audit/application/ports/audit-log.writer.ts
- backend/modules/audit/application/ports/audit-log.gateway.ts
- backend/modules/audit/application/use-cases/record-audit-event.use-case.ts
- backend/modules/audit/application/use-cases/list-audit-events.use-case.ts
- backend/modules/audit/application/use-cases/get-entity-history.use-case.ts
- backend/modules/audit/infrastructure/prisma-audit-log.gateway.ts
- backend/modules/audit/index.ts
- tests/unit/backend/audit/record-audit-event.test.ts
- tests/unit/backend/audit/list-audit-events.test.ts
- tests/unit/backend/audit/get-entity-history.test.ts
```

**Done criteria desta etapa (todas observáveis):**
- [ ] DC2.1 — `AuditLogWriter.record` persiste `entityType/entityId/action/actorId/actorLabel/description/changedFrom/changedTo/metadata` e seta `performedAt` server-side quando ausente (unit verde).
- [ ] DC2.2 — catálogo rejeita `entityType`/`action` desconhecidos com erro tipado (unit verde).
- [ ] DC2.3 — `list-audit-events` filtra por `entityType`, `action`, `actorId`, período `from`/`to`, paginação `limit` (default 50, max 200) e `cursor`, ordenado `performedAt desc` (unit verde).
- [ ] DC2.4 — `get-entity-history` retorna eventos de uma entidade em ordem cronológica (unit verde).
- [ ] DC2.5 — `npx tsc --noEmit` 0 errors; `npx vitest run` com os 3 novos testes verdes (contagem nova ≈ +3 sobre baseline 256/257).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do módulo>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run`

### Etapa 3 — Writer no composition root + injeção nos módulos sensíveis

**Objetivo**: criar o módulo `audit` UMA vez em `createBackendComposition()` e injetar o
port `AuditLogWriter` via `gatewayDependencies` nos módulos sensíveis. Publicação
**síncrona pós-write de domínio** (padrão igual a `notificationsModule` como gateway
dependency), sem regra de negócio em route handler. Manter os gateways de domínio fazendo o
write de auditoria intra-módulo; **nenhum** `prisma.audit_logs` fora de `backend/modules/audit`.

**Arquivos a criar/alterar (caminhos completos):**
```
- backend/composition/root.ts                                          (audit na BackendComposition + injeção)
- backend/modules/audit/index.ts
- backend/modules/task-management/infrastructure/task-service.gateway.ts      (APPROVE/REJECT/COMPLETE/DELETE/UPDATE)
- backend/modules/project-management/infrastructure/project-management.gateway.ts   (CREATE/UPDATE/DELETE)
- backend/modules/project-membership/infrastructure/prisma-project-membership.gateway.ts (ADD_MEMBER/REMOVE_MEMBER/ROLE)
- backend/modules/user-management/infrastructure/user-service.gateway.ts       (ROLE_CHANGE, USERS status moderate)
- backend/modules/store/infrastructure/store-service.gateway.ts                (PURCHASE_* e REWARD_*)
- backend/modules/work-execution/infrastructure/work-session-service.gateway.ts (COMPLETE/DELETE + FINALIZE auto-close; remover history.create da linha ~270)
```

**Mudanças de schema (se houver):** nenhuma nesta etapa.

**Done criteria desta etapa (todas observáveis):**
- [ ] DC3.1 — composition root expõe `audit` e injeta o MESMO `auditLogWriter` (singleton da instância Prisma) em task/project/project-membership/user/store/work-execution (leitura do `root.ts`).
- [ ] DC3.2 — approveTask de um actor grava `TASK`/`APPROVE` com `actorId`/`actorLabel` corretos (integration roundtrip em `tests/integration`).
- [ ] DC3.3 — completeWorkSession+auto-close grava `WORK_SESSION`/`COMPLETE`/`FINALIZE`; `prisma.history.create` removido do work-execution (grep zero em `backend/modules/work-execution`).
- [ ] DC3.4 — anti-scatter: `rg "prisma.audit_logs" backend/modules` retorna apenas `backend/modules/audit/infrastructure/prisma-audit-log.gateway.ts`.
- [ ] DC3.5 — `npx tsc --noEmit` 0 errors e suíte unit/integration verdes (256/257 + novos).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` ·
`npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run` ·
`docker compose up -d postgres && npx vitest run` (G4, pois mexe em DB)

### Etapa 4 — Endpoint de consulta com filtros + RBAC

**Objetivo**: expor leitura da trilha via API Next.js, com filtros e autorização.
RBAC por `ensureAnyRole(["COORDENADOR", "GERENTE"])` — sem nova permission, para não
acoplar ao 01 (decisão em STATE).

**Arquivos a criar/alterar (caminhos completos):**
```
- app/api/audit/route.ts                                     (GET /api/audit com filtros)
- app/api/audit/entity/[entityType]/[entityId]/route.ts     (GET histórico por entidade)
- tests/unit/backend/audit/audit-api-rbac.test.ts
```

**Done criteria desta etapa (todas observáveis):**
- [ ] DC4.1 — `GET /api/audit?entityType=TASK&action=APPROVE&actorId=7&from=...&to=...` retorna evento(s) filtrados paginados (unit/api test verde).
- [ ] DC4.2 — `GET /api/audit/entity/TASK/42` retorna histórico da entidade ordenado (unit/api test verde).
- [ ] DC4.3 — não autenticado → 401; `VOLUNTARIO`/`COLABORADOR` → 403; `COORDENADOR`/`GERENTE` → 200 (audit-api-rbac.test.ts verde).
- [ ] DC4.4 — parâmetros `from`/`to` inválidos → 400; `limit` fora de 1..200 → 400 (unit/api test verde).
- [ ] DC4.5 — `npx tsc --noEmit` 0 errors; lint das rotas exit 0.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json app/api/audit/**` ·
`npx tsc --noEmit` · `npx vitest run`

### Etapa 5 — Testes de integração + gates finais

**Objetivo**: fechar a verificação com testes reais de DB (append-only, writer roundtrip,
anti-scatter) e rodar todos os gates na ordem canônica.

**Arquivos a criar/alterar (caminhos completos):**
```
- tests/integration/audit-immutability.test.ts      (environment node, DB real em localhost:5432)
- tests/integration/audit-writer-roundtrip.test.ts  (environment node, DB real)
- STATE.json                                        (atualização de evidências)
```

**Done criteria desta etapa (todas observáveis):**
- [ ] DC5.1 — UPDATE/DELETE em `audit_logs` levanta erro do trigger (integration verde).
- [ ] DC5.2 — writer roundtrip persiste e relê evento com `changedFrom`/`changedTo` íntegros (integration verde).
- [ ] DC5.3 — todos os gates finais verdes na ordem: G1 → G2 → G3 → (G4/G5).
- [ ] DC5.4 — STATE.json com ACs mapeadas e evidências preenchidas (eventos + evidência).

**Gates desta etapa:** checklist da seção 4 abaixo.

## 4. Verificação (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (baseline 256/257; único fail conhecido floating-session-timer)
docker compose up -d postgres && npx vitest run                                # G4 (integração: audit-immutability, audit-writer-roundtrip)
npx prisma migrate dev || npx prisma migrate deploy                            # G5 (sem db push)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; não siga adiante.
- **Depois** volte à SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para o cache em `STATE.json` (seção `rollbacks`) — motivo + ação tomada.
- Rollback de migração: `npx prisma migrate resolve --rolled-back <nome>` **apenas** em
  cenário de deploy; localmente `migrate dev` com downgrade de `schema.prisma`.

## 6. Entregáveis de conclusão

Checklist que, tudo verde, marca `02` como `done`:

- [ ] Todos os gates (G1–G5) verdes
- [ ] Todas as ACs da SPEC com teste/evidência mapeada (AC-02-01..AC-02-13)
- [ ] Migrações versionadas sem `db push`
- [ ] `STATE.json` atualizado (eventos, evidências, rollbacks)
- [ ] Grep anti-scatter: `prisma.audit_logs` só existe em `backend/modules/audit`; zero `prisma.history.create` novo adicionado fora do legado permitido (LabNoticeRepository)