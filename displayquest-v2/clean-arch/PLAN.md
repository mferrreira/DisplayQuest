# clean-arch · PLAN — Plano de refatoracao (execucao)

> Contrato de **execucao** derivado da SPEC aprovada (`../SPEC.md`). Define a ordem de
> implementacao em ondas e batches atomicos, cada um com arquivos tocados, done
> criteria observaveis e gates. Leia antes: `ARCHITECTURE.md` (processo), `SPEC.md`
> (contrato), `AGENTS.md` (gotchas do repo). **A recipe da secao 3 e aplicada a cada
> modulo; as ondas apenas parametrizam onde.** Nao implementar nada agora: este
> documento e o roteiro.

## 1. Pre-requisitos do executor

1. Repo na branch `dev`, worktree limpo, `node_modules` ok.
2. Postgres up quando o lote exigir G4: `docker compose up -d postgres`.
3. Ambiente para vitest: `set -a; source .env; set +a`.
4. Lint local em worktree com `npx eslint --no-eslintrc --config .eslintrc.json`.
5. Nunca printar/commitar `NEXTAUTH_SECRET`.

## 2. Inventario de pontos de violacao (baseline registrado em 2026-09-19)

Fonte: analise do codigo `HEAD` (3be192e). Serve de checklist inicial; a Onda 0
congela com greps/evidencia e a execucao atualiza conforme cada onda reduz.

### 2.1 Entidades acopladas ao Prisma (`backend/models/**`)
| Arquivo | Ocorrencia |
|---|---|
| `backend/models/WorkSession.ts:1` | `import { work_sessions } from '@prisma/client'`; `fromPrisma/toPrisma` (69/86) |
| `backend/models/user/User.ts:1` | `import { users, UserRole, ProfileVisibility }`; `fromPrisma/toPrisma` (68/87) |
| `backend/models/Badge.ts` | idem (badges) |
| `backend/models/DailyLog.ts` | idem |
| `backend/models/ProjectMembership.ts` | idem |
| `backend/models/Purchase.ts` | idem |
| `backend/models/Reward.ts` | idem |
| puros (sem import Prisma) | `Task`, `Issue`, `LabEvent`, `LabNotice`, `LaboratorySchedule`, `LabResponsibility`, `Project`, `UserSchedule` |

### 2.2 Regras de negocio nos gateways de infraestrutura
Total gateways ≈ 4.949 linhas vs use cases ≈ 537 (quase todos pass-through de 9-10
linhas).

| Modulo | Gateway | Regras concentradas (exemplos) |
|---|---|---|
| work-execution | `infrastructure/work-session-service.gateway.ts` (579) | duracao server-authoritative (118-151, 307-393), pausa programada/normalizacao (470-515), anti-farm `MAX_STRETCH_SEC`, autorizacao via `hasPermission`, upsert de daily log (406-462), `ensureUserIsProjectMember` com prisma direto (527-541) |
| task-management | `infrastructure/task-service.gateway.ts` (912) | autorizacao/visibilidade/aprovacao e progresso |
| reporting | `infrastructure/prisma-reporting.gateway.ts` (999) | agregacoes de horas/relatorios |
| lab-operations | `infrastructure/lab-operations.gateway.ts` (625) | validacoes/estados |
| project-membership | `infrastructure/prisma-project-membership.gateway.ts` (376) | regras de roles/ACL |
| user-management | `infrastructure/user-service.gateway.ts` (370) | aprovacao/leaderboard |
| store | `infrastructure/store-service.gateway.ts` (298) | aprovacao/rejeicao/deny/complete |
| project-management | `infrastructure/project-management.gateway.ts` (288) | autorizacao |
| gamification | `infrastructure/prisma-gamification.gateway.ts` (284) | award/progressao |
| notifications | `infrastructure/prisma-notifications.gateway.ts` (132) | CRUD (piloto ideal) |
| identity-access | `infrastructure/rbac-identity-access.gateway.ts` (26) | fina |

### 2.3 `domain/` com repositorio dentro
- `backend/modules/gamification/domain/engines/badge-rules.engine.ts:21-25` e
  `badge.engine.ts`: `new BadgeRepository()/new UserRepository()/...` e querys dentro
  do "domain".

### 2.4 Contracts/ports vazando Prisma ou models
- `backend/modules/user-management/application/contracts.ts:1` -> `UserRole` de `@prisma/client`
- `backend/modules/project-membership/application/contracts.ts:1-2` -> `UserRole` + `Role` de `@/lib/auth/rbac`
- `backend/modules/work-execution/application/contracts.ts:1-2` e
  `application/ports/work-execution.events.ts:1` -> `WorkSession`/`DailyLog` (models)
- `backend/modules/task-management/application/contracts.ts`, `ports/task-management.gateway.ts` -> `Task` (model)
- `backend/modules/gamification/application/ports/gamification.gateway.ts`,
  `lab-operations/application/ports/lab-operations.gateway.ts`,
  `project-management/application/contracts.ts`,
  `store/application/ports/store.gateway.ts` -> models

### 2.5 RBAC acoplado
- `lib/auth/rbac.ts:1` -> `import type { UserRole } from "@prisma/client"`.

### 2.6 Rotas com prisma/factory direto
- `app/api/auth/register/route.ts`
- `app/api/tasks/global-progress/route.ts`
- `app/api/work-sessions/[id]/route.ts:32-38` reimplementa logica de "completion
  intent" no handler.

### 2.7 Helpers puros fora do dominio
- `lib/work-sessions/schedule.ts` (puro) -> mover/reexportar para `backend/domain/work`.

## 3. Receita de refatoracao de modulo (aplicada em todas as ondas)

Passos na ordem, cada um com evidencia:

1. **R0 Golden tests.** Criar `tests/unit/modules/<modulo>/golden.<modulo>.test.ts`:
   mockar o seam de dados (`@/lib/database/prisma` e/ou os `backend/repositories/*`
   — padrao do repo: mocka a lib seam, nunca `node:` builtins) e congelar uma matriz
   de entradas x saidas para CADA metodo do gateway que contem regra. Rodar verde e
   registrar o arquivo no STATE (evidencia "golden-created").
2. **R1 Mover tipos puros.** Garantir que `contracts.ts`/`ports/` usam tipos de
   `backend/domain` (criar/mover entidades e enums primeiro). `tsc --noEmit` verde.
3. **R2 Extrair regra.** Mover a logica do gateway para o use case (e regras de
   dominio para `backend/domain`). O use case passa a depender de `ports`; o gateway
   vira adapter fino (I/O + mapping + `fromPrisma`-like no repository).
4. **R3 Contract tests.** Uma suite compartilhada por port (`ports/<modulo>.contract.test.ts`)
   rodando contra (a) a implementacao antiga indexada no seam e (b) a nova.
   Paridade de resultados na matriz do golden.
5. **R4 Route mapping.** Rotas do modulo passam a mapear `DomainError` para status
   estavel; nenhum prisma/factory na rota; rota-test com `vi.mock("@/backend/composition/root")`.
6. **R5 Gates + STATE.** G0-G3 verdes (G4 quando adapter DB reescrito); DCs da onda
   marcadas; `decisions[]` registradas; rollbacks registrados; batch `verified`->`done`.

A receita e a mesma em todas as ondas; a diferenca e o parametro `<modulo>` e os
pontos do inventario secao 2. Testes novos devem cobrir ao menos 1 ramo por regra
extraida (cobertura por preenchimento, nao por plateau de linha).

## 4. Estrategia de testes ("garantir que nada quebrou")

Quatro camadas, recomputadas a cada batch:

1. **Golden/characterization (R0).** Congela o comportamento atual. Pre-condicao:
   semantica identica pos-refactor. Verificacao: saida da matriz antes == depois;
   o diff zero e evidencia no STATE.
2. **Contract tests (R3).** Mesma suite roda na impl antiga e nova do port. Se a
   nova impl repetir um bug da antiga, o contract test captura (nao e permissivo:
   contract test e comportamental, nao replica implementacao).
3. **Use case / domain unit tests.** Fakes de ports; cada ramo de regra movida tem
   teste proprio (ex.: pausa programada, anti-farm, autorizacao de aprovacao de
   tarefa). Puros, environment node onde nao houver DOM.
4. **Route tests.** Mock de `getBackendComposition`; assert de status/body shape.
   Usar `msw` ou mock direto conforme o caso.

Regras de baseline:
- Na Onda 0 registra-se o baseline real (contagem + lista) no STATE.
- Apos cada batch, `npx vitest run` nao pode derrubar nenhum teste que passava na
  captura do baseline (unica excecao documentada: testes previamente marcados como
  flaky/known-fail no STATE).
- A contagem so pode subir. Se cair, rollback.
- G4 (Postgres) para modulos cujo adapter DB foi reescrito: roundtrip smoke por
  endpoint principal do modulo (ex.: work-execution: start->pause->complete->log).

Infra de teste a garantir na Onda 0:
- `tests/setup.ts` (shims Radix: `hasPointerCapture`, `scrollIntoView`,
  `ResizeObserver`; guardado por `typeof Element !== "undefined"`).
- `tests/unit/modules/` criado (nota: `tests/` e gitignored em `.gitignore:163`;
  decisao no STATE: adicionar excecao `!tests/unit/modules/**` para versionar
  golden/contract/use-case/arch tests — ver decisao DEC-02).
- `vitest.config.mts` ja inclui `tests/unit/**`, `tests/integration/**`,
  `features/**/__tests__/**`, `entities/**`.

## 5. Ondas (ordem obrigatoria; cada onda e uma sequencia de batches)

Cada batch abaixo lista: arquivos-alvo, entrega, DCs, gates. DC numeradas por
`OND<on da><batch>` (ex.: OND0-B1-DC3). Estado e registrado no STATE.json.

### ONDA 0 — Fundacoes (nao toca modulos de negocio)

**Batch 0.1 — Infra de enforcement (G0)**
- Criar: `.dependency-cruiser.js` (regras RG-01..RG-06 + RG-10), `scripts/arch-check.sh`
  (roda `npx depcruise` com exit code), `package.json` script `arch:check`, devDep
  `dependency-cruiser`.
- Criar: `backend/domain/index.ts` vazio inicial como barrel; `backend/modules/*/index.ts`
  ja existem.
- Ajustar `.eslintrc.json` `no-restricted-imports` para os casos RG-01/RG-06 mais
  criticos (domain sem prisma; app sem prisma).
- DCs:
  - [ ] OND0-B1-DC1 `npm run arch:check` exit 0 no estado atual (baseline G0 com violacoes
        esperadas **reportadas** e aceitas por allow-list com referencia de tarefa de
        migracao; o gate final exige ZERO violacoes — ver DEC-01: manter allow-list por
        onda, removida na 9).
  - [ ] OND0-B1-DC2 `no-restricted-imports` valido em worktree (lint exit 0 nos convencionais).
  - [ ] OND0-B1-DC3 `npx tsc --noEmit` 0 errors; `npx vitest run` reproduz o baseline atual.
- Gates: G0(baseline), G1, G2, G3.

**Batch 0.2 — Nucleo puro `backend/domain/` + erros tipados**
- Criar: `backend/domain/errors/DomainError.ts` (`.status`, `.code`, mensagem estavel) e
  subclasses `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `ConflictError`,
  `ValidationError`; `backend/domain/errors/index.ts`.
- Criar enums puros (fonte de contratos): `backend/domain/identity/UserRole.ts`,
  `backend/domain/task/TaskStatus.ts`, `backend/domain/task/TaskVisibility.ts`,
  `backend/domain/work/WorkSessionStatus.ts`, `backend/domain/reporting/ReportPeriod.ts`
  (namespaces de valores espelhando o schema, SEM import prisma).
- Testes: `tests/unit/modules/_foundations/domain-error.test.ts` (status/codigo);
  `tests/unit/modules/_foundations/enums-mirror-schema.test.ts` (cada enum de dominio
  tem valores iguais aos do schema — smoke, nao acoplado a prisma, so um array
  literal de referencia).
- DCs:
  - [ ] OND0-B2-DC1 `backend/domain/errors` puro (G0); testes verdes.
  - [ ] OND0-B2-DC2 enums de dominio existem sem import prisma (grep zero).
  - [ ] OND0-B2-DC3 nenhum consumo novo: nenhum contrato ainda mudou (regressao zero).
- Gates: G0-G3.

**Batch 0.3 — RBAC puro + retirada do `@prisma/client` de `lib/auth`**
- Criar: `backend/domain/identity/permissions.ts` (PERMISSIONS/FEATURE_ACCESS
  tipadas com `Role` de dominio), `backend/domain/identity/has-permission.ts`
  (pure), `backend/domain/identity/roles.ts`.
- Ajustar: `lib/auth/rbac.ts` importa os tipos/enums do dominio (removendo
  `import type { UserRole } from "@prisma/client"`); contrato publico mantido.
- Testes: `tests/unit/modules/_foundations/rbac-policy.test.ts` (matriz completa de
  PERMISSIONS/roles, incl. negacao default); `tests/unit/modules/_foundations/rbac-ui-parity.test.ts`
  (paridade `hasPermission` do dominio vs consumo atual — placeholder que congela o
  output atual).
- DCs:
  - [ ] OND0-B3-DC1 `rg "@prisma/client" lib/auth` zero.
  - [ ] OND0-B3-DC2 politicas puras testadas; sem mudanca de comportamento (parity
        test amarelo antes/verde depois).
  - [ ] OND0-B3-DC3 G0-G3 verdes.
- Gates: G0-G3.

**Batch 0.4 — Limpeza tipografica dos contracts (sem mover logica)**
- Ajustar somente tipos (sem comportamento):
  - `backend/modules/user-management/application/contracts.ts` (UserRole puro),
  - `backend/modules/project-membership/application/contracts.ts` (UserRole/Role puros),
  - contratos/ports que referenciam models trocam para os equivalentes de `backend/domain`
    (WorkSession/DailyLog/Task/...) mantendo mesma forma.
- DCs:
  - [ ] OND0-B4-DC1 `rg "@prisma/client" backend/*/application` zero.
  - [ ] OND0-B4-DC2 `rg "backend/models" backend/modules/*/application` zero.
  - [ ] OND0-B4-DC3 G2/G3 verdes; G4 (roundtrip) verde nos modulos com teste de integracao.
- Gates: G0-G3, G4 (se roundtrip existir para algum).

**Batch 0.5 — Infra de teste + baseline registrado**
- Garantir `tests/setup.ts` (shims Radix) se faltar; criar `tests/unit/modules/_foundations/`.
- Rodar G3 limpo; registrar baseline (contagem + lista) no STATE (`baseline.unit`).
- Mover/reexportar `lib/work-sessions/schedule.ts` -> `backend/domain/work/schedule.ts`
  mantendo exports (decidir por re-export em `backend/domain/index.ts` para nao
  quebrar imports atuais; DEC-03).
- DCs:
  - [ ] OND0-B5-DC1 baseline registrado com comando e saida no STATE.
  - [ ] OND0-B5-DC2 testes verdes apos mover schedule (equal exports).
- Gates: G1-G3.

### ONDA 1 — Piloto: `notifications` (valida a receita completa)

Modulo de menor risco (gateway 132 linhas, use cases existentes, eventos ja ligados
na composition root). Aplica a receita R0-R5 inteira.

**Batch 1.1 — Golden + tipos puros (R0-R1)**
- `tests/unit/modules/notifications/golden.notifications.test.ts` (mock
  `@/backend/repositories/UserRepository`/prisma se usar; matriz de list/mark/delete).
- `backend/domain/notification/Notification.ts` + enums; contracts usam tipos puros.
- DCs: OND1-1-DC1 golden verde e registrado; OND1-1-DC2 contracts sem prisma; G0-G3 verdes.

**Batch 1.2 — Extrair regras para use cases (R2-R3)**
- Regras que estao no gateway (filtragem por usuario, "mark-all", delete de outros)
  movem para os use cases; gateway vira adapter fino com `NotificationRepository` injetado.
- Contract test `ports/notifications.contract.test.ts` roda na impl antiga (indexada)
  e na nova.
- DCs: OND1-2-DC1 use case detem regras (padrao R2); OND1-2-DC2 contract verde nas duas impls;
  OND1-2-DC3 gateway sem `throw new Error` de negocio; G0-G3 verdes.

**Batch 1.3 — Route mapping + ajustes necessarios (R4)**
- Rotas `app/api/notifications/*`: mapear erros tipados; rota-test com mock de composition.
- DCs: OND1-3-DC1 rotas sem prisma/factory; OND1-3-DC2 HTTP estavel (403/404/400);
  OND1-3-DC3 erros tipados usados; G0-G3 verdes.

**Batch 1.4 — Fecho piloto + decisoes**
- Revisar receita vs aprendizado; registrar `decisions[]` (DEC-04 padrao de barrel,
  DEC-05 convencao de nome de port, etc.) e ajustar receita no PLAN se preciso.
- DCs: OND1-4-DC1 modulo `done` conforme SPEC §5; OND1-4-DC2 receita validada.

### ONDA 2 — Identidade e usuarios (`identity-access`, `user-management`)

**Batch 2.1** Golden+tipos: `backend/domain/identity/User.ts` puro; contracts puros
(R0-R1).
**Batch 2.2** Extrair regras (aprovacao de conta, leaderboard, roles, deduct hours) para
`user-management/application/use-cases`; `identity-access` vira policy pura consumida
por port.
**Batch 2.3** Gateways finos; contract tests; rotas (approve/[id]/roles/points/
leaderboard/profiles) com erros tipados e mock de composition.
**Batch 2.4** Gates: G0-G3 verdes para os dois modulos; G4 roundtrip (users).

### ONDA 3 — Execucao de trabalho (`work-execution`) — regras mais criticas

**Batch 3.1** Golden completo do `WorkSessionServiceGateway` (start/complete/update/
pause/resume/list/normalize + daily log): matriz cobre pausa programada, anti-farm,
auto-close de expirados, autorizacao, vinculo de tasks.
**Batch 3.2** Extrair para use cases + dominio puro (`backend/domain/work/schedule.ts`,
`WorkSession` rico, invariantes de duracao). Gateway vira fino; repositories injetados.
**Batch 3.3** Contract tests + rotas (`work-sessions`, `daily_logs`) com erro tipado
e remocao do "completion intent" do handler ([id]/route.ts:32-38).
**Batch 3.4** G4 roundtrip sessao completa (start->pause->resume->complete->log) e
testes da cron noturna (varredura 23:59) via use case.

### ONDA 4 — Gestao de tarefas (`task-management`) — o maior

**Batch 4.1** Golden do `task-service.gateway.ts` (912 linhas): criar/listar/atualizar/
aprovar/rejeitar/completar + visibilidade publica/delegada/privada + progresso
individual + compat `assignedTo`/`task_assignees`/`task_user_progress`.
**Batch 4.2** Dominio puro (`backend/domain/task/...`): Task rica, politica de
visibilidade, regra de aprovacao (base para RF `plan-v2/01`), progresso.
**Batch 4.3** Use cases detendo as regras; gateway fino. Contract tests.
**Batch 4.4** Rotas (tasks, global-progress vira use case; register route limpo); erros
tipados. G4 roundtrip tasks.

### ONDA 5 — Projetos (`project-management`, `project-membership`)

**Batch 5.1** Golden + tipos puros (Project, Membership, roles GERENTE_PROJETO etc).
**Batch 5.2** Extrair regras (can-actor-access, membership ACL, assign leader) para use
cases; policies puras em `backend/domain/project`.
**Batch 5.3** Contract tests + rotas (projects, members) com erro tipado; registro de
audit vira evento (prepara Onda de logging/audit v2).
**Batch 5.4** G4 roundtrip projects/members.

### ONDA 6 — Gamificacao

**Batch 6.1** Golden dos engines e do gateway (award por task/sessao, progression).
**Batch 6.2** Mover `badge.engine`/`badge-rules.engine` para `backend/domain/gamification`
PURA: regras recebem dados via portas (`GamificationDataPort`), nunca repos no construtor.
**Batch 6.3** Prisma gateway fino; contract tests; eventos de progresso (task/sessao)
normalizados como ports de evento.
**Batch 6.4** Rotas (badges, user-badges, rewards, purchases parcial) + G4.

### ONDA 7 — Relatorios (`reporting`)

**Batch 7.1** Golden do `prisma-reporting.gateway.ts` (999 linhas): weekly reports,
project reports, agregacao de horas por periodo.
**Batch 7.2** Dominio puro (`backend/domain/reporting`): periodos, agregados, read models.
**Batch 7.3** Use cases detendo regras; gateway fino; contract tests.
**Batch 7.4** Rotas (weekly-reports, project-reports, weekly-hours-history, report-files
com seam `readReportFileBytes`) + G4.

### ONDA 8 — Loja e laboratorio (`store`, `lab-operations`)

**Batch 8.1** Golden: store (resgate/aprovacao/deny/complete/rewards) e lab-operations
(issues, lab-events, lab-notices, responsibilities, schedules).
**Batch 8.2** Dominio puro (Purchase/Reward em `backend/domain/store`; LabEvent/Issue/...
em `backend/domain/lab`); `purchase-query-scope.ts` move para app/domain conforme uso.
**Batch 8.3** Use cases + gateways finos; contract tests.
**Batch 8.4** Rotas + G4.

### ONDA 9 — Cleanup, docs e fechamento

**Batch 9.1** Remover da deploy allow-list do dep-cruiser qualquer violacao residual;
`rg` de baseline em zero (AC-00-01..04). `backend/models/` sem prisma e com migracao
concluida; decidir se `backend/models` vira re-export de `backend/domain` ou e
eliminado (DEC-06).
**Batch 9.2** Atualizar `backend/README.md`, `docs/04-arquitetura-tecnica.md` e
`AGENTS.md` (nova arvore, gates incl. G0, convencoes); atualizar
`displayquest-v2/plan-v2/ARCHITECTURE.md` registrando pre-requisito `clean-arch`.
**Batch 9.3** `npm run arch:check` exit 0 **sem allow-list**; G1-G3; G4 full.
Registrar AC-00-01..15 e marcar toda a refatoracao `done`.

## 6. Verificacao (final)

```
npm run arch:check                 # G0 — zero violacoes
npx eslint --no-eslintrc --config .eslintrc.json <todos modificados>  # G1
npx tsc --noEmit                   # G2
set -a; source .env; set +a; npx vitest run   # G3 — baseline inteiro verde + novos
# G4/G5 conforme batch (Postgres up; schema inalterado salvo DEC em contrario)
```

## 7. Rollback

- Gate vermelho ou regressao ou divergencia de SPEC -> `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; repensar, refazer, re-verificar.
- Rollback registrado no STATE (`rollbacks[]`). Nunca commitar base vermelha.

## 8. Checklist de conclusao (macro)

- [ ] Todas as ondas `done` com evidencia no STATE.
- [ ] AC-00-01..15 verdes (SPEC §6) e registradas.
- [ ] G0 sem allow-list exit 0; baselines de teste nao regrediram.
- [ ] Frontend intocado salvo correcao minima documentada.
- [ ] Docs atualizados; `plan-v2` pronto para `01`.