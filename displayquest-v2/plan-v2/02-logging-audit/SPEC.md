# 02 · SPEC — Logging & Audit centralizado

> Contrato de **comportamento** da funcionalidade `02`: o "o quê" e o "why", sem o
> "como". Esta é a **fonte de verdade** do que será implementado — se o código divergir
> daqui, o código está errado. Qualquer mudança de requisito abre nova revisão.
>
> Seções em PT-BR sem acentos (convenção do repo). IDs/enums em inglês.

## 1. Propósito

Hoje os eventos sensíveis do sistema são gravados de forma **dispersa**: chamadas diretas a
`prisma.history.create` espalhadas por gateways de domínio (ex.: `work-session-service.gateway.ts:270`,
`prisma-gamification.gateway.ts:217`), e a tabela `history` é **reutilizada para finalidades não
auditáveis** (lab notices com `entityId = 0` e `delete` permitido em `LabNoticeRepository.ts`).
Esta funcionalidade cria uma **trilha de auditoria funcional centralizada** — nova tabela
`audit_logs`, append-only e imutável — alimentada por **um único escritor** (módulo `audit`
instanciado no composition root e injetado nos módulos sensíveis), atendendo
**RNF-17** (manter datas, status e relacionamentos para auditoria funcional de tarefas, sessões,
compras e issues) e a **regra de negócio §10** (trilha de auditoria que explica transições e
operações), que hoje não têm implementação dedicada.

## 2. Contexto atual (linha de base)

- `prisma/schema.prisma:248` — `model history`: `entityType/entityId/action/performedBy
  (Int FK)/performedAt/oldValues/newValues/description/metadata`, com índices em
  `[entityType, entityId]`, `[performedBy]`, `[performedAt]`, `[action]`.
- `backend/repositories/LabNoticeRepository.ts` — usa `history` como **armazenamento de lab
  notices** (`entityType="LAB_NOTICE"`, `entityId: 0`) e faz `prisma.history.delete()` — ou
  seja, linhas do histórico são apagáveis.
- `backend/modules/work-execution/infrastructure/work-session-service.gateway.ts:270` —
  `prisma.history.create` para eventos de leitura (`read_by_project_leader`) — history como log.
- `backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts:207-249` —
  `tx.history.create`/`findFirst` para controle de prêmios (`entityType="USER"`).
- `backend/composition/root.ts` — composition root com `createXModule({ gatewayDependencies })`;
  padrão existente de injeção de dependência intra-módulo (ex.: `notificationsModule` como
  gateway dependency de task-management).
- `lib/auth/api-guard.ts` — `requireApiActor`, `ensurePermission`, `ensureAnyRole` para RBAC de rotas.
- `lib/auth/rbac.ts` — permissões existentes (MANAGE_*). **Não existe** VIEW_AUDIT_LOGS.
- Requisitos-fonte: `docs/APOO/05-requisitos-nao-funcionais.md` (RNF-16, RNF-17) e
  `docs/03-regras-de-negocio.md` §10 (Historico, notificacoes e auditoria). **Não há RF
  funcional** para auditoria nas specs de visão — lacuna que esta SPEC preenche.

Lacunas identificadas: (1) zero trilha central de auditoria funcional; (2) `history` poliglota
e mutável; (3) eventos espalhados com formato inconsistente (nomes de action por convenção
implícita); (4) sem consulta/observabilidade de auditoria.

## 3. Atores e papéis

| Ator | Papel | Interação |
|---|---|---|
| `COORDENADOR` | Gestor do lab | Consulta a trilha de auditoria; responsável pela evidência de auditoria funcional. |
| `GERENTE` | Gestor | Consulta a trilha de auditoria. |
| `GERENTE_PROJETO`/`LABORATORISTA`/`COLABORADOR`/`PESQUISADOR`/`VOLUNTARIO` | Atores de domínio | Executam ações auditáveis (aprovam/rejeitam tasks, gerenciam membros/roles, finalizam sessões, compram, resolvem issues); **não** consultam a trilha. |
| Sistema / cron | Ator técnico | Escritor automático (ex.: fechamento noturno de sessões) com `actorLabel` explícito (ex.: `system:cron`), `actorId` nulo. |

## 4. Requisitos funcionais

> Fonte de requisito: **RNF-17** + **regra de negócio §10** (sem RF funcional correspondente
> nas specs de visão). Requisitos abaixo são o detalhamento funcional da funcionalidade `02`.

### RF-02.1 — Escritor único de auditoria (who/what/when + old/new prevalece)

- **Descrição:** toda ação auditada é persistida por **um único** escritor (`AuditLogWriter`),
  gravando: `entityType`, `entityId`, `action`, `actorId`+`actorLabel`, `performedAt`,
  `changedFrom` (old, opcional), `changedTo` (new, opcional), `description` (opcional),
  `metadata` (opcional, qualquer dado extra não-normativo). O par old/new **prevalece** quando
  fornecido (dados de estado antes/depois da transição).
- **Fronteira:** `backend/modules/audit`.
- **Entradas/Saídas:** `AuditEventRecord` → persistência em `audit_logs` (append-only).
- **Cenário principal (Gherkin):** Given uma operação sensível concluída com sucesso; When o
  módulo publica o evento via `AuditLogWriter.record`; Then uma linha é inserida em
  `audit_logs` com `performedAt` server-side e sem possibilidade de UPDATE/DELETE.
- **Regras de negócio:** action e entityType devem pertencer ao catálogo do módulo
  (`action-catalog.ts`), senão o writer rejeita; performedAt default `now()` do banco;
  actorLabel snapshot em string (mantém o executor identificável mesmo após exclusão do usuário).

### RF-02.2 — Catálogo de ações auditadas

- **Descrição:** conjunto fechado (documentado e validado) de pares entityType/action.
  Respectivos pontos de gatilho:
  - `TASK`: `CREATE`, `UPDATE`, `COMPLETE`, `APPROVE`, `REJECT`, `DELETE`
  - `PROJECT`: `CREATE`, `UPDATE`, `DELETE`
  - `PROJECT_MEMBERSHIP`: `ADD_MEMBER`, `REMOVE_MEMBER`, `GRANT_ROLE`, `REVOKE_ROLE`
  - `USER`: `ROLE_CHANGE`, `ACCOUNT_MODERATION`
  - `PURCHASE`: `CREATE`, `APPROVE`, `REJECT`, `COMPLETE`, `CANCEL`
  - `REWARD`: `CREATE`, `UPDATE`, `DELETE`, `GRANT`
  - `WORK_SESSION`: `START`, `COMPLETE`, `UPDATE`, `DELETE`, `FINALIZE` (fechamento automático)
  - `ISSUE`: `CREATE`, `UPDATE`, `ASSIGN`, `RESOLVE`, `REOPEN`
- **Fronteira:** contrato do módulo `audit` (catálogo TS).
- **Entradas/Saídas:** string `entityType`/`action` → validação → persistência ou erro.
- **Regras de negócio:** valores fora do catálogo são rejeitados (erro tipado); a adição de uma
  ação nova não exige migração de schema (campos são String).

### RF-02.3 — Consulta de auditoria com filtros

- **Descrição:** leitura da trilha por who/what/when: filtros por `entityType`, `action`,
  `actorId`, período `from`/`to`; paginação (`limit` 1..200, default 50, cursor); ordenação
  `performedAt desc`.
- **Fronteira:** `app/api/audit` (roteador fino) + use-case `list-audit-events`.
- **Entradas/Saídas:** `GET /api/audit?<filtros>` → JSON `{ events: [...], cursor?, total? }`.
- **Regras de negócio:** apenas `COORDENADOR`/`GERENTE` consultam; parâmetros inválidos → 400.

### RF-02.4 — Histórico por entidade

- **Descrição:** consulta cronológica por `(entityType, entityId)` — demonstração da regra §10
  ("explica transições e operações") e do RNF-16 (rastreio de alterações relevantes).
- **Fronteira:** `app/api/audit/entity/[entityType]/[entityId]` + use-case `get-entity-history`.
- **Entradas/Saídas:** `GET /api/audit/entity/TASK/42` → `{ events: [...] }` ordenado por
  `performedAt asc`.
- **Regras de negócio:** mesma autorização do RF-02.3.

### RF-02.5 — Escritor automático (sistema/cron)

- **Descrição:** operações sem executor humano (ex.: varredura noturna 23:59 que finaliza
  sessões) gravam com `actorLabel` explícito (`system:cron`) e `actorId` nulo, mantendo a
  trilha íntegra.
- **Fronteira:** escritor do módulo `audit` (sem UI).

## 5. Requisitos não funcionais

| Categoria | RNF | Critério de verificação |
|---|---|---|
| Imutabilidade | Append-only: nenhum `UPDATE`/`DELETE` em `audit_logs` (trigger no banco + writer sem métodos de mutação) | `tests/integration/audit-immutability.test.ts` roda UPDATE/DELETE e falha |
| Retenção | Logs retidos **indefinidamente** nesta versão; sem TTL/purga automática (escala de laboratório = dezenas de milhares de linhas/ano) | Evidência: NFR documentado; índice em `performedAt` viabiliza purga futura |
| Volume/latência | Escrita síncrona por evento não degrada o P95 das rotas sensíveis; custo-alvo ≲ +10 ms por evento (1 INSERT) | `tests/integration/audit-writer-roundtrip.test.ts` (sem benchmark formal) |
| Auditoria (RNF-17) | Datas (`performedAt`), status/estado (`changedTo`/`changedFrom`), relacionamentos (`entityType`+`entityId`, `actorId`) preservados por ano | AC-02-03/AC-02-08/AC-02-09 |
| Segurança | Consulta restrita por RBAC (`COORDENADOR`/`GERENTE`); sem exposição de valores sensíveis no JSON de retorno (descrição/metadata controlados) | `tests/unit/backend/audit/audit-api-rbac.test.ts` |
| Observabilidade | Trilha consultável sem SQL manual via API | AC-02-10/AC-02-11 |

## 6. Modelo de dados (se aplicável)

Novo modelo em `prisma/schema.prisma` (nomes snake_case, padrão do repo):

```prisma
model audit_logs {
  id          Int      @id @default(autoincrement())
  entityType  String
  entityId    Int
  action      String
  actorId     Int?
  actorLabel  String
  performedAt DateTime @default(now())
  changedFrom Json?
  changedTo   Json?
  description String?
  metadata    Json?
  actor       users?   @relation("AuditLogsByUser", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId, performedAt])
  @@index([action, performedAt])
  @@index([actorId, performedAt])
  @@index([performedAt])
}
```

- Relação nova em `users`: `auditLogs audit_logs[] @relation("AuditLogsByUser")`.
- `actorId` nullable + `onDelete: SetNull`: exclusão de usuário **não** apaga a trilha; o
  snapshot `actorLabel` preserva o executor legível.
- `id Int`: escala de laboratório; migrar para `BigInt` fica reservado a expansão futura.
- `entityType`/`action` como `String` (não enum Postgres): adicionar ação não exige migração;
  validado no catálogo TS do módulo `audit`.
- Migração versionada `add_audit_logs` deve incluir, além do `CREATE TABLE` (equivalente ao
  Gerado pelo Prisma), os índices acima e o trigger de imutabilidade:
  `audit_logs_immutable` (`BEFORE UPDATE OR DELETE ON audit_logs ... RAISE EXCEPTION`).
  Sem `prisma db push`.
- A tabela `history` **permanece intacta** e continua servindo lab notices/prêmios (decisão em STATE).

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados
| Método | Rota | Descrição | Permissão |
|---|---|---|---|
| GET | `/api/audit?entityType&action&actorId&from&to&limit&cursor` | Lista eventos de auditoria filtrados e paginados | `COORDENADOR` ou `GERENTE` (via `ensureAnyRole`) |
| GET | `/api/audit/entity/[entityType]/[entityId]` | Histórico cronológico da entidade | `COORDENADOR` ou `GERENTE` (via `ensureAnyRole`) |

Convenção de rota segue o padrão do repo (`app/api/<dominio>/route.ts`), kebab-case em
parâmetros — `[entityType]` recebe o valor do catálogo (ex.: `TASK`, `PROJECT`); `[entityId]`
inteiro obrigatório (400 se inválido).

### 7.2 Eventos de domínio publicados/consumidos
| Evento | Publisher | Consumidor |
|---|---|---|
| `AuditEventRecord` (pares entityType/action do RF-02.2) | módulos sensíveis via port `AuditLogWriter` | módulo `audit` (writer → `audit_logs`) |

Sem fila/message broker: publicação é **síncrona**, pós-write de domínio, no mesmo request
(decisão em STATE; o port permite evoluir para fila sem tocar os publishers).

## 8. Casos de teste / evidência esperada

| Teste | Tipo | Cobre |
|---|---|---|
| `tests/unit/backend/audit/record-audit-event.test.ts` | unit | record valida catálogo, seta performedAt, persiste old/new |
| `tests/unit/backend/audit/list-audit-events.test.ts` | unit | filtros entityType/action/actorId/from/to + paginação |
| `tests/unit/backend/audit/get-entity-history.test.ts` | unit | histórico por entidade, ordenação asc |
| `tests/unit/backend/audit/audit-api-rbac.test.ts` | unit (rota) | 401/403/200, validação 400 de from/to/limit |
| `tests/integration/audit-writer-roundtrip.test.ts` | integration (node, DB real em `localhost:5432`) | gravação + releitura íntegra de changedFrom/changedTo |
| `tests/integration/audit-immutability.test.ts` | integration (node, DB real) | trigger bloqueia UPDATE/DELETE |

Gates finais na ordem: G1 (`npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`),
G2 (`npx tsc --noEmit`), G3 (`npx vitest run`, baseline 256/257 + novos verdes), G4
(`docker compose up -d postgres && npx vitest run`), G5 (`npx prisma migrate dev|deploy`).
Contagem esperada ao final: baseline 256/257 + ~6 novos testes unit + 2 integration.

## 9. Acceptance criteria (definitivos e rastreáveis)

Cada AC: **observável**, **testável por terceiro**, com referência a teste/evidência.

| ID | Done criterion (Given/When/Then) | Evidência para verificar | Rastreia |
|---|---|---|---|
| AC-02-01 | Given uma ação auditável; When `AuditLogWriter.record` é chamado com entityType/action do catálogo; Then `audit_logs` ganha linha com performedAt, actorId, actorLabel snapshot e old/new preservados | `record-audit-event.test.ts` + `audit-writer-roundtrip.test.ts` | RF-02.1, RNF-17 |
| AC-02-02 | Given `entityType` ou `action` fora do catálogo; When o writer processa; Then a gravação é rejeitada com erro tipado e nada é persistido | `record-audit-event.test.ts` | RF-02.2 |
| AC-02-03 | Given aprovação de task executada por actor X; When `approveTask` conclui; Then evento `TASK`/`APPROVE` gravado com actorId X e estado pós (changedTo) | integration `audit-writer-roundtrip.test.ts` (roundtrip via use-case) | RF-02.1, RF-02.2 |
| AC-02-04 | Given rejeição de task; When `rejectTask` conclui; Then evento `TASK`/`REJECT` gravado com actor e descrição | integration roundtrip | RF-02.2 |
| AC-02-05 | Given CRUD de projeto e de membership/roles; When create/update/delete/GRANT_ROLE/REVOKE_ROLE; Then eventos `PROJECT`/`PROJECT_MEMBERSHIP` gravados | integration roundtrip | RF-02.2 |
| AC-02-06 | Given compra criada/aprovada/complete/cancelada e reward criada/granted; Then eventos `PURCHASE_*`/`REWARD_*` gravados com changedTo | integration roundtrip | RNF-17 (compras) |
| AC-02-07 | Given sessão finalizada (manual `COMPLETE` ou auto-close noturno `FINALIZE`); Then evento `WORK_SESSION` gravado; `prisma.history.create` do work-execution removido | integration + grep zero de `history.create` em work-execution | RNF-17 (sessões) |
| AC-02-08 | Given issue criada/atualizada/resolvida; Then eventos `ISSUE`/`CREATE`/`UPDATE`/`RESOLVE` gravados | integration roundtrip | RNF-17 (issues) |
| AC-02-09 | Given `audit_logs` já populada; When um UPDATE ou DELETE é tentado (SQL direto); Then o trigger bloqueia com erro | `audit-immutability.test.ts` | RNF imutabilidade |
| AC-02-10 | Given actor autorizado; When `GET /api/audit?entityType&action&actorId&from&to` ; Then resposta filtrada, paginada, ordenada `performedAt desc`; filtros inválidos → 400 | `list-audit-events.test.ts` + `audit-api-rbac.test.ts` | RF-02.3 |
| AC-02-11 | Given actor autorizado; When `GET /api/audit/entity/TASK/42`; Then histórico cronológico da entidade (performedAt asc) | `get-entity-history.test.ts` | RF-02.4, RNF-16 |
| AC-02-12 | Given actor não autenticado, ou VOLUNTARIO/COLABORADOR; When acessa endpoints de audit; Then 401, resp. 403; `COORDENADOR`/`GERENTE` → 200 | `audit-api-rbac.test.ts` | RF-02.3/02.4, RNF segurança |
| AC-02-13 | Given função/cargo alterado (aprovado ou revogado); When `updateUser`/membership executa; Then `USER`/`ROLE_CHANGE` ou `ROLE_GRANT`/`ROLE_REVOKE` gravado com changedFrom/changedTo de roles | integration roundtrip | RF-02.2, regra §10 |

## 10. Fora de escopo (desta versão)

- Migrar, deprecar ou remover a tabela `history` / usos legados (`LabNoticeRepository`,
  gamificação). Lab notices **não** migram para `audit_logs`.
- Purga/retention job ou endpoint de limpeza da trilha (TTL).
- Auditoria de logins, reads e lab notices.
- Exportação (CSV/PDF), dashboards de auditoria.
- Nova permission `VIEW_AUDIT_LOGS` (adiada para `01-roles-permissions`).

## 11. Dependências e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| Nenhuma dependência de funcionalidade (paralelizável com 01) | dep | ok |
| Postgres local ligado para G4/integração | runtime | `docker compose up -d postgres` |
| Trigger via SQL raw em migração Prisma | técnico | ok — migração é arquivo `.sql` editável |
| Novo `NEXTAUTH_SECRET`/`DATABASE_URL` do `.env` para env do vitest | runtime | gotcha AGENTS.md (`set -a; source .env; set +a`)