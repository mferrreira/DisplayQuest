# Backend (`backend/`)

Documentacao de manutencao e contribuicao do backend.

## Arquitetura utilizada

Backend modular com **Clean Architecture incremental**, com foco em:

- separacao por dominio/modulo
- use cases explicitos
- inversao de dependencias (ports/interfaces)
- composicao centralizada de dependencias

### Composicao central (obrigatorio)

Arquivo-chave:

- `backend/composition/root.ts`

Ele monta os modulos e resolve dependencias cruzadas (ex.: notificacoes, identity access, gamification).

Rotas em `app/api/*` devem usar:

- `getBackendComposition()`

E nao instanciar modulos diretamente com `createXModule()`.

## Estrutura da pasta

```text
backend/
├── composition/      # composition root do backend
├── models/           # entidades/modelos de dominio
├── repositories/     # acesso a dados legado/reutilizado (Prisma-backed)
└── modules/          # modulos por dominio
   └── <modulo>/
      ├── application/
      │  ├── contracts.ts
      │  ├── ports/
      │  └── use-cases/   # quando aplicavel
      ├── domain/         # (quando existe regra de dominio explicita)
      ├── infrastructure/ # implementacoes concretas (Prisma, adapters, publishers)
      └── index.ts        # factory do modulo
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

1. `app/api/.../route.ts` valida request/auth
2. rota resolve modulo via `getBackendComposition()`
3. modulo chama `use case` (ou gateway exposto, dependendo do modulo)
4. `application` depende de `ports` (interfaces)
5. `infrastructure` implementa os ports
6. persistencia via `repositories`/Prisma

## Regras de dependencia (manutencao)

### Permitido

- `application/use-cases` -> `application/ports`
- `infrastructure` -> repositorios/Prisma/libs
- `composition/root` -> factories de modulos

### Evitar

- `infrastructure` chamando `createOutroModulo()` para resolver dependencia cruzada
- rotas `app/api/*` criando modulos diretamente
- regra de negocio importante espalhada em route handler

## Como contribuir: editar funcionalidade existente

### 1. Localizar dominio

Exemplos:

- tarefas -> `backend/modules/task-management`
- relatorios -> `backend/modules/reporting`
- operacoes do laboratorio -> `backend/modules/lab-operations`

### 2. Localizar o ponto de mudanca

- validacao/fluxo -> `application/use-cases`
- contrato de entrada/saida -> `application/contracts.ts`
- dependencia externa/DB -> `infrastructure/*` e/ou `repositories/*`
- montagem -> `index.ts` do modulo (e, se necessario, `composition/root.ts`)

### 3. Ajustar a rota (se houver endpoint)

- use `getBackendComposition()`
- mantenha a rota fina (parse/HTTP/auth)
- mova regra de negocio para modulo/use case

## Como adicionar nova funcionalidade (checklist)

### A. Se for dentro de modulo existente

1. Adicionar contrato em `application/contracts.ts` (se necessario)
2. Criar/ajustar `port` em `application/ports/*`
3. Implementar use case em `application/use-cases/*` (quando fizer sentido)
4. Implementar suporte na infraestrutura (`infrastructure/*`)
5. Expor no `index.ts` do modulo
6. Consumir via rota em `app/api/*` usando `getBackendComposition()`

### B. Se for modulo novo

1. Criar pasta `backend/modules/<novo-modulo>/`
2. Definir `application/contracts.ts`
3. Definir `application/ports/*`
4. Implementar `infrastructure/*`
5. Criar `index.ts` (factory do modulo)
6. Registrar no `backend/composition/root.ts`
7. Criar/ajustar rotas `app/api/*`

## Padrões adotados no projeto

- Factories de modulo aceitam `options` (injeção opcional para testes/composicao)
- Dependencias cruzadas sao injetadas no composition root
- Refatoracao incremental: nem todo modulo precisa ter o mesmo nivel de use case/abstracao para evoluir

## Semantica atual de tasks (importante)

- `taskVisibility = public`: task visivel no escopo com progresso individual por usuario
- `taskVisibility = delegated/private`: task visivel no projeto, mas manipulacao restrita a atribuídos (ou gestao)
- multiatribuicao suportada via `task_assignees` (mantendo `assignedTo` como compatibilidade)
- progresso individual suportado via `task_user_progress`
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

- mudou rota? continua usando `getBackendComposition()`
- mudou dependencia entre modulos? ajustou `backend/composition/root.ts`
- mudou contrato? atualizou chamada da rota/consumidor
- mudou persistencia? validou impacto no Prisma/schema/migration
- documentou comportamento novo (README da pasta ou `docs/` quando relevante)
