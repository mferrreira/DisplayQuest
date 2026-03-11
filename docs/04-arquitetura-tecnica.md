# Arquitetura Tecnica

## 1. Visao geral

O `DisplayQuest` e um sistema web monolitico em `Next.js`, com frontend e backend mantidos no mesmo repositorio.

Stack principal:

- `Next.js` com App Router
- `React 19` e `TypeScript`
- `Prisma ORM`
- `PostgreSQL`
- `next-auth`

Organizacao geral:

- interface e navegacao em `app/*` e `components/*`
- acesso a dados e estado compartilhado da UI em `contexts/*` e `hooks/*`
- API HTTP em `app/api/*`
- regras de negocio e integracoes backend em `backend/*`

## 2. Arquitetura do frontend

### 2.1 Estrutura da interface

Pastas mais relevantes:

- `app/`: paginas, layouts e route handlers
- `components/ui/`: componentes base
- `components/features/`: blocos funcionais por dominio
- `components/admin/`: componentes administrativos
- `components/forms/`: formularios e dialogs
- `contexts/`: providers de dominio e acesso a API
- `hooks/`: hooks reutilizaveis de fluxo

### 2.2 Providers e composicao da UI

O layout global do cliente fica em `app/client-layout.tsx`.

Fluxo principal:

1. `SessionProvider`
2. `ThemeProvider`
3. identificacao se a rota pertence ao dashboard
4. injecao de providers de dominio quando necessario
5. renderizacao do `AppHeader` e do `FloatingSessionTimer` nas rotas do dashboard

Providers globais do dashboard:

- `UserProvider`
- `ProjectProvider`
- `TaskProvider` apenas em rotas que realmente consomem o dominio de tarefas, como `/dashboard`, `/dashboard/projetos` e `/dashboard/admin`

Providers especificos por area:

- em `/dashboard/laboratorio`, o layout local injeta `ResponsibilityProvider`, `LaboratoryScheduleProvider`, `LabEventsProvider`, `LabNoticesProvider` e `IssueProvider`

### 2.3 Estado, IO e fronteira com a API

- `contexts/api-client.ts` concentra os wrappers de chamadas HTTP do frontend
- cada provider de dominio encapsula carregamento, mutacoes e sincronizacao de estado
- `hooks/` sao usados quando o fluxo e reutilizavel, mas nao precisa necessariamente viver em provider global
- componentes de tela cuidam de filtro, dialog, selecao local e estados estritamente visuais

### 2.4 Organizacao funcional das telas

Rotas principais do dashboard:

- `/dashboard`: quadro principal de tarefas
- `/dashboard/projetos`
- `/dashboard/laboratorio`
- `/dashboard/weekly-reports`
- `/dashboard/loja`
- `/dashboard/profile`
- `/dashboard/leaderboard`
- `/dashboard/admin`

## 3. Arquitetura do backend

### 3.1 Organizacao modular

O backend foi organizado em modulos por dominio dentro de `backend/modules/*`.

Modulos atuais:

- `identity-access`
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

### 3.2 Estrutura interna dos modulos

O projeto segue uma organizacao modular inspirada em Clean Architecture, mas aplicada de forma incremental.

Elementos presentes conforme o modulo:

- `application/contracts.ts`
- `application/ports/*`
- `application/use-cases/*` quando o dominio ja foi extraido nesse nivel
- `infrastructure/*` para gateways, publishers e adaptadores
- `index.ts` como factory do modulo

Observacao importante:

- nem todos os modulos possuem o mesmo grau de detalhamento interno
- em varios casos, o gateway da infraestrutura ainda concentra parte importante da orquestracao do dominio

### 3.3 Composition root

Arquivo central:

- `backend/composition/root.ts`

Responsabilidades:

- instanciar todos os modulos
- resolver dependencias cruzadas
- montar publishers e integracoes auxiliares
- expor o singleton via `getBackendComposition()`

Dependencias cruzadas atuais incluem, por exemplo:

- `task-management` usando `identityAccess`, `notifications` e eventos de progresso ligados a `gamification`
- `lab-operations` usando `identityAccess` e `notifications`
- `work-execution` usando publisher de eventos conectado a `gamification`

### 3.4 Papel das rotas HTTP

As rotas em `app/api/*` funcionam como adaptadores HTTP.

Responsabilidades esperadas:

- autenticar o usuario
- interpretar parametros e payload
- aplicar validacoes HTTP imediatas
- chamar o modulo adequado via `getBackendComposition()`
- converter o resultado em resposta JSON

Regra arquitetural:

- rotas nao devem instanciar `createXModule()` diretamente
- regra de negocio relevante nao deve ficar espalhada nos route handlers

## 4. Fluxo de requisicao

Fluxo tipico:

1. a interface dispara uma chamada via `contexts/api-client.ts` ou provider de dominio
2. a rota em `app/api/*` recebe a requisicao
3. a rota autentica o usuario e valida o contexto da chamada
4. a rota resolve o modulo pelo composition root
5. o modulo delega para gateway, contrato ou use case correspondente
6. a infraestrutura conversa com repositorios, Prisma e dependencias auxiliares
7. o resultado retorna para a rota e depois para a UI

## 5. Persistencia e modelo de dados

A persistencia usa PostgreSQL com Prisma.

Conjuntos principais de entidades:

- usuarios e acesso: `users`
- projetos e membership: `projects`, `project_members`
- tarefas: `tasks`, `task_assignees`, `task_user_progress`
- execucao de trabalho: `work_sessions`, `work_session_tasks`, `daily_logs`
- relatorios e horas: `weekly_reports`, `weekly_hours_history`
- laboratorio: `lab_responsibilities`, `lab_events`, `laboratory_schedules`, `user_schedules`, `issues`
- gamificacao e loja: `badges`, `user_badges`, `rewards`, `purchases`
- apoio transversal: `notifications`, `history`

Detalhamento adicional:

- ver `docs/07-modelo-de-dados.md`

## 6. Autenticacao e autorizacao

### 6.1 Autenticacao

- o sistema usa `next-auth`
- o login principal usa `CredentialsProvider`
- a sessao adota estrategia `JWT`

### 6.2 Autorizacao

- o controle de acesso usa `UserRole` e mapeamento de permissoes em `lib/auth/rbac.ts`
- verificacoes aparecem tanto no backend quanto em controles de apresentacao da UI
- a decisao final sobre permissao deve ser sempre do backend

Arquivos centrais:

- `lib/auth/rbac.ts`
- `lib/auth/api-guard.ts`
- `lib/auth/server-auth.ts`

## 7. Decisoes arquiteturais relevantes

- monolito web com separacao logica clara entre interface, HTTP e dominio
- composition root central para evitar dependencia cruzada escondida
- modularizacao incremental, sem exigir que todos os dominios tenham a mesma maturidade interna
- preservacao de compatibilidade em trechos legados, especialmente no dominio de tarefas
- uso de providers por area no frontend para evitar espalhar IO por componentes visuais

## 8. Pontos de atencao para manutencao

- novas rotas devem passar pelo composition root
- mudancas entre dominios precisam ser refletidas em `backend/composition/root.ts`
- evolucoes no frontend devem priorizar reutilizacao de providers e hooks existentes
- alteracoes no schema precisam atualizar a documentacao e ser avaliadas no impacto dos gateways e contexts
- no dominio de tarefas, a convivencia entre `assignedTo`, `task_assignees`, `taskVisibility` e `task_user_progress` exige cuidado para evitar regressao funcional
