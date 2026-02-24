# DisplayQuest

Sistema web para gestao de laboratorio, projetos, tarefas, relatorios, horas de trabalho e gamificacao.

## Objetivo

Centralizar operacao e acompanhamento do laboratorio em uma unica plataforma:

- usuarios e aprovacao de contas
- projetos e membros
- tarefas e fluxo de aprovacao
- sessoes de trabalho e logs diarios
- relatorios e estatisticas
- gamificacao (pontos, badges, loja e compras)
- operacoes de laboratorio (issues, responsabilidades, horarios, eventos)

## Stack

- Frontend: `Next.js (App Router)`, `React 19`, `TypeScript`, `Tailwind`, `shadcn/ui`
- Backend: `Next.js Route Handlers`, `Prisma`, `PostgreSQL`
- Auth: `next-auth`
- Infra local: `Docker` / `docker-compose`

## Estrutura (alto nivel)

```text
app/                 # UI (paginas App Router + API routes)
backend/             # Regras/modulos backend (Clean Architecture incremental)
components/          # Componentes UI e features
contexts/            # Estado global da UI por dominio
hooks/               # Hooks de dados/efeitos de UI
lib/                 # Auth, prisma, utilitarios e APIs do frontend
prisma/              # Schema e migrations
docs/                # Documentacao complementar
```

## Documentacao por pasta

- `README.md` (raiz): visao geral, setup e mapa do sistema
- `app/README.md`: estrutura da UI, contextos, states/effects, telas e features
- `backend/README.md`: arquitetura backend, composition root, como adicionar/editar funcionalidades
- `docs/backend-clean-architecture.md`: padrao arquitetural backend adotado
- `docs/database-workflow.md`: fluxo operacional de banco/migrations

## Modulos do sistema (backend)

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

## Rotas principais da aplicacao (UI)

- `/login`, `/register`
- `/dashboard`
- `/dashboard/admin`
- `/dashboard/projetos`
- `/dashboard/laboratorio`
- `/dashboard/weekly-reports`
- `/dashboard/loja`
- `/dashboard/profile`
- `/dashboard/leaderboard`

## API (resumo)

As rotas ficam em `app/api/*` e usam `getBackendComposition()` para resolver modulos do backend.

Dominios principais expostos:

- `users`, `projects`, `tasks`
- `work-sessions`, `daily_logs`
- `weekly-reports`, `weekly-hours-history`
- `rewards`, `purchases`, `badges`, `user-badges`
- `issues`, `responsibilities`, `schedules`, `laboratory-schedule`, `lab-events`
- `notifications`

## Tasks (resumo de comportamento atual)

- `public`: visivel no escopo (projeto/laboratorio) com progresso individual por usuario
- `delegated` / `private`: visivel no projeto, com manipulacao restrita aos atribuídos (suporta multiatribuicao)
- `isGlobal=true`: representa task publica de laboratorio (quest global) no modelo atual

## Setup rapido (local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar ambiente

Criar `.env.local` com pelo menos:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/display-quest"
NEXTAUTH_SECRET="troque-isto"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Banco de dados

```bash
npm run db:generate
npm run db:migrate:dev
# opcional (dev/test only)
npm run db:seed
```

Observacao: seed e manual e voltada para desenvolvimento/teste. Nao roda automaticamente em startup/deploy.

### 4. Rodar aplicacao

```bash
npm run dev
```

## Scripts uteis

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run db:generate`
- `npm run db:migrate:dev`
- `npm run db:migrate:deploy`
- `npm run db:migrate:status`
- `npm run db:reset:local`
- `npm run db:safe-deploy`

## Docker (local)

```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

## Manutencao (ponto importante)

O backend foi padronizado com composicao central em `backend/composition/root.ts`.

- rotas `app/api/*` nao devem instanciar `createXModule()` diretamente
- use `getBackendComposition()` nas rotas
- dependencias entre modulos devem ser resolvidas no composition root

## Entregaveis de documentacao (atual)

- visao geral do sistema (raiz)
- arquitetura e contribuicao backend (`backend/README.md`)
- estrutura e manutencao da UI (`app/README.md`)
