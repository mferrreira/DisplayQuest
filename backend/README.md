# Backend (`backend/`)

Documentacao de manutencao e contribuicao do backend.

> Atualizado em 2026-10 apos a refatoracao clean-arch (`displayquest-v2/clean-arch`,
> ondas 0-9): arvore em camadas coberta pelo gate G0, allow-list do dependency-cruiser
> **vazia**, erros tipados no dominio e rotas finas com mapper compartilhado.

## Arquitetura utilizada

Backend modular com **Clean Architecture**, com foco em:

- separacao por dominio/modulo (11 modulos em `backend/modules/`)
- use cases explicitos em `application/use-cases/`
- inversao de dependencias (ports locais de cada modulo)
- **core puro** em `backend/domain/`: regras como funcoes puras + erros tipados, sem ORM,
  sem framework e sem relogio global (`now` sempre parametro)
- composicao centralizada de dependencias (`backend/composition/root.ts`)
- arquitetura **vigia por gate**: `npm run arch:check` (dependency-cruiser, RG-01..RG-06)
  com allow-list vazia — violacao nova quebra o gate na hora

## Estrutura da pasta

```text
backend/
├── domain/             # CORE PURO: erros tipados + regras por dominio (sem Prisma/relogio)
│   ├── errors.ts       # ValidationError, NotFoundError, ConflictError, ForbiddenError...
│   └── identity/ work/ task/ project/ gamification/ store/ lab/ reporting/ ...
├── models/             # record builders PUROS (fromPrisma/toPrisma/toJSON) — sem @prisma/client
├── repositories/       # repositorios Prisma LEGADOS (usados pelos gateways legados/seams)
├── composition/
│   └── root.ts         # composition root + checkDatabaseHealth (probe de saude do banco)
└── modules/            # modulos por dominio
   └── <modulo>/
      ├── application/
      │  ├── contracts.ts      # contratos de entrada/saida
      │  ├── ports/            # interfaces implementadas pela infraestrutura local
      │  └── use-cases/        # orquestram regras puras + ports (nunca Prisma)
      ├── infrastructure/
      │  ├── repositories/     # adapters Prisma finos (implementam os ports)
      │  ├── adapters/         # directory/publisher e afins
      │  └── *.gateway.ts      # gateways LEGADOS: seam dos testes golden/contract (DEC-15/19)
      └── index.ts             # factory do modulo
```

## Modulos atuais

- `identity-access` (RBAC e autorizacao)
- `user-management`
- `project-management`
- `project-membership`
- `task-management`
- `work-execution`
- `reporting`
- `gamification`
- `store`
- `notifications`
- `lab-operations`

## Fluxo de uma requisicao (padrao)

1. `app/api/.../route.ts` autentica e faz parse (rota fina)
2. rota resolve o modulo via `getBackendComposition()`
3. o modulo expoe fachada backed por use cases
4. use cases compoem regras puras (`backend/domain`) + ports
5. adapters Prisma finos implementam os ports (escrevem so colunas reais do schema)
6. erros de dominio (tipados) sao mapeados para HTTP pelo mapper compartilhado
   `lib/api/domain-error-response.ts` (`domainErrorResponse`): ValidationError→400,
   NotFoundError→404, ConflictError→409, ForbiddenError→403; erros nao-DomainError
   (ex.: enum do Prisma, FK P2003) seguem no tratamento legado da rota

## Regras de dependencia (gate G0 — `npm run arch:check`)

- **RG-01** `backend/domain` (core) nao importa Prisma/framework/lib de I/O/adapter;
  `now` e sempre parametro (date-fns aceito como lib de funcoes puras — DEC-22)
- **RG-02** `domain/` de modulo nao instancia repositorios (os engines legados da
  gamification vivem em `infrastructure/legacy-engines/`)
- **RG-03** `application/` nao importa Prisma/repositorios/`backend/models`
- **RG-04** `infrastructure/` nao importa factory de outro modulo (import type-counts);
  dependencia cruzada so no composition root, eventos via **porta local** (DEC-21)
- **RG-05** composition root e o unico ponto que injeta modulos uns nos outros
- **RG-06** rotas `app/api/*` nao importam Prisma/repositorios/factory de modulo;
  **RG-06b** frontend nao importa ORM

**A allow-list esta VAZIA desde a OND9-B1: qualquer nova violacao falha o gate
imediatamente. Nao re-adicionar entradas sem decisao registrada no STATE.json.**

## Convencoes adotadas

- Factories de modulo aceitam `repository?`/`ports?` como seam primaria (DEC-17);
  `gateway?`/`gatewayDependencies?` existem apenas onde as suites golden/contract
  indexam a implementacao legada (DEC-15/19/25)
- Regras como funcoes puras em `backend/domain/<dominio>/*-rules.ts`; `now` sempre
  parametro; validacoes preservam mensagens/ordem legadas (quirks pinados como contrato)
- Erros tipados: use cases lancam `ValidationError`/`NotFoundError`/`ConflictError`/
  `ForbiddenError`; quando o corpo HTTP legado precisa ser EXATO, o use case devolve
  `{ denied: true, message }` em vez de lancar (ex.: `ListPurchasesUseCase`)
- Comportamento legado e congelado por **golden tests** (antes de mexer) e provado
  equivalente por **contract tests** antigo-vs-novo; conserto de quirk exige aprovacao
  do dono (precedente: DEC-23/QUIRK-8S1)
- `backend/models/` permanece camada de record builders puros (DEC-24) — nao e
  re-export do dominio nem sera eliminada; formas de linha do schema sao interfaces
  locais escalares e enums (`UserRole`, `ProfileVisibility`) vem do core
- Publishers de eventos entre modulos sao injetados na composition root via porta
  local do modulo consumidor (DEC-21)

## Gates de entrega

| Gate | Comando | Criterio |
|---|---|---|
| G0 arch | `npm run arch:check` | exit 0, allow-list vazia |
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` | exit 0 |
| G2 types | `npx tsc --noEmit` | 0 erros |
| G3 unit | `npx vitest run` | suite completa verde (baseline 67 arquivos / 1245 testes; so cresce) |
| G4 integracao | `DATABASE_URL=postgresql://...@127.0.0.1:5433/dq_dev_test npx vitest run` | roundtrips SO contra o banco de teste isolado (`dq-dev-test-db`, 5433) — nunca a 5432 |

## Como contribuir: editar funcionalidade existente

### 1. Localizar dominio

Exemplos:

- tarefas -> `backend/modules/task-management`
- relatorios -> `backend/modules/reporting`
- operacoes do laboratorio -> `backend/modules/lab-operations`

### 2. Localizar o ponto de mudanca

- regra de negocio pura -> `backend/domain/<dominio>/*-rules.ts` (com teste unitario)
- fluxo/orquestracao -> `application/use-cases`
- contrato de entrada/saida -> `application/contracts.ts`
- persistencia -> `infrastructure/repositories/*` (adapter fino sobre o port)
- montagem -> `index.ts` do modulo (e, se necessario, `composition/root.ts`)

### 3. Ajustar a rota (se houver endpoint)

- use `getBackendComposition()`
- mantenha a rota fina (parse/HTTP/auth)
- mapeie erros com `domainErrorResponse(error)` primeiro; fallback legado depois

## Como adicionar nova funcionalidade (checklist)

### A. Se for dentro de modulo existente

1. Golden test do comportamento atual (se for mexer em comportamento legado)
2. Adicionar contrato em `application/contracts.ts` (se necessario)
3. Criar/ajustar `port` em `application/ports/*`
4. Implementar use case em `application/use-cases/*` consumindo regras puras
5. Implementar/ajustar o adapter em `infrastructure/repositories/*`
6. Expor no `index.ts` do modulo
7. Contract test antigo-vs-novo quando existir implementacao legada indexada
8. Consumir via rota em `app/api/*` usando `getBackendComposition()`

### B. Se for modulo novo

1. Criar pasta `backend/modules/<novo-modulo>/` (application/infrastructure/index.ts)
2. Registrar o nome em `MODULES` de `.dependency-cruiser.js` (as regras RG-02..RG-05
   sao geradas por modulo)
3. Registrar no `backend/composition/root.ts`
4. Criar/ajustar rotas `app/api/*`

## Padroes adotados no projeto

- Factories de modulo aceitam `options` (injecao opcional para testes/composicao)
- Dependencias cruzadas sao injetadas no composition root (nunca dentro de infra)
- Comportamento legado e pinado por teste antes de qualquer refactor (golden ->
  contract -> rotas -> roundtrip G4)

## Semantica atual de tasks (importante)

- `taskVisibility = public`: task visivel no escopo com progresso individual por usuario
- `taskVisibility = delegated/private`: task visivel no projeto, mas manipulacao restrita a atribuídos (ou gestao)
- multiatribuicao suportada via `task_assignees` (mantendo `assignedTo` como compatibilidade)
- progresso individual suportada via `task_user_progress`
- `isGlobal = true`: task publica de laboratorio (quest global) no modelo legado/atual

## Banco e migracoes

Arquivos relacionados:

- `prisma/schema.prisma`
- `prisma/migrations/*`
- `docs/database-workflow.md`

Comandos uteis (raiz do projeto):

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:safe-deploy
```

Seed:

- `npm run db:seed` e apenas para dev/teste (execucao manual)
- deploy/startup nao devem rodar seed automaticamente

## Checklist de PR / manutencao (recomendado)

- import novo entre camadas? `npm run arch:check` continua exit 0 (sem nova allow-list)
- mudou rota? continua usando `getBackendComposition()` + `domainErrorResponse`
- mudou dependencia entre modulos? ajustou `backend/composition/root.ts`
- mudou contrato? atualizou chamada da rota/consumidor
- mudou persistencia? validou impacto no Prisma/schema/migration e no roundtrip G4 (5433)
- mudou comportamento legado? golden/contract pinam (ou a divergencia foi aprovada)?
- documentou comportamento novo (README da pasta ou `docs/` quando relevante)
