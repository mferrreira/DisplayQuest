# Arquitetura Tecnica

## 1. Visao de alto nivel

Stack principal:

- `Next.js` (App Router)
- `React` + `TypeScript`
- `Prisma`
- `PostgreSQL`
- `next-auth` (credenciais + JWT session)

O projeto combina frontend e backend na mesma base:

- UI em `app/*` + `components/*` + `contexts/*`
- API HTTP em `app/api/*`
- regras de negocio em `backend/*`

## 2. Arquitetura de frontend (medio nivel)

### Estrutura

- `app/`: paginas e layouts
- `components/ui/`: componentes base
- `components/features/`: componentes por dominio
- `components/admin/`: telas administrativas
- `components/forms/`: formularios e dialogs
- `contexts/`: estado global por dominio
- `hooks/`: hooks reutilizaveis de feature

### Estado e IO

- `contexts/*` encapsulam chamadas REST e estado global da UI
- `contexts/api-client.ts` centraliza wrappers de request
- componentes de tela consomem contextos/hooks e mantem estado local de UI (filtros, dialogs, loading local)

## 3. Arquitetura de backend (medio nivel)

### Clean Architecture incremental

Backend organizado por modulos em `backend/modules/*`, com separacao entre:

- `application` (contratos, ports, use cases)
- `infrastructure` (implementacoes concretas)
- `repositories` (Prisma-backed e reutilizados)

### Composition Root (ponto central)

Arquivo:

- `backend/composition/root.ts`

Responsabilidades:

- montar modulos
- resolver dependencias cruzadas
- garantir inversao de dependencia (DIP) de forma explicita

Rotas `app/api/*` devem usar:

- `getBackendComposition()`

## 4. Fluxo de requisicao (baixo/medio nivel)

1. Cliente chama endpoint em `app/api/*`
2. Route handler valida request e autenticacao/autorizacao
3. Route handler resolve modulo via `getBackendComposition()`
4. Modulo chama use case/gateway exposto
5. Use case depende de `ports`
6. Implementacao concreta em `infrastructure` usa repositorios/Prisma
7. Resultado volta para a rota e e convertido em resposta HTTP/JSON

## 5. Dominios principais (backend)

- `identity-access` (RBAC/autorizacao)
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

## 6. Banco de dados (visao arquitetural)

Persistencia em PostgreSQL com Prisma.

Entidades importantes:

- `users`, `projects`, `project_members`
- `tasks`, `task_assignees`, `task_user_progress`
- `work_sessions`, `work_session_tasks`, `daily_logs`
- `weekly_reports`, `weekly_hours_history`
- `lab_responsibilities`, `lab_events`, `laboratory_schedules`, `user_schedules`
- `badges`, `user_badges`, `rewards`, `purchases`
- `issues`, `notifications`, `history`

Ver detalhes em `docs/07-modelo-de-dados.md`.

## 7. Seguranca (visao tecnica)

### Autenticacao

- `next-auth` com `CredentialsProvider`
- sessao com estrategia `JWT`
- `maxAge` configurado (2 dias)

### Autorizacao

- RBAC baseado em `roles` + `permissions`
- verificacoes em rotas e modulos
- helpers de auth/guard em `lib/auth/*`

### Senhas

- hash com `bcryptjs`
- validacao de credenciais no fluxo de login

### Observacoes

- a sessao e reidratada com dados do usuario do banco no callback `session`
- permissao nao deve ser inferida apenas pela UI; backend e a fonte de verdade

## 8. Decisoes arquiteturais relevantes para continuidade

- monorepo simples (frontend + backend no mesmo projeto)
- composicao centralizada para evitar acoplamento escondido
- evolucao incremental (sem reescrita total)
- compatibilidade mantida em partes do dominio de tasks (`assignedTo` + `assigneeIds`, `isGlobal`)
