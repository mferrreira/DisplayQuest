# DisplayQuest

<p align="center">
  <img src="./public/LOGO.png" alt="DisplayQuest" width="140" />
</p>

<p align="center">
  Plataforma web para gestao de laboratorio, projetos, tarefas, relatorios, carga horaria e gamificacao.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Local%20Infra-2496ED?logo=docker&logoColor=white" />
</p>

<p align="center">
  <a href="#visao-geral">Visao Geral</a> •
  <a href="#stack">Stack</a> •
  <a href="#estrutura-do-repositorio">Estrutura</a> •
  <a href="#setup-rapido-local">Setup</a> •
  <a href="#documentacao">Documentacao</a>
</p>

## Visao Geral

O `DisplayQuest` centraliza a rotina do laboratorio em uma unica aplicacao. O sistema combina acompanhamento de projetos, operacao diaria, registro de horas e mecanicas de gamificacao para reduzir dispersao entre ferramentas e facilitar a continuidade do trabalho por novos membros.

Principais frentes cobertas pelo sistema:

- gestao de usuarios e aprovacao de contas
- projetos, membros e papeis de atuacao
- tarefas com quadro Kanban e fluxo de revisao
- sessoes de trabalho, logs diarios e relatorios
- operacao do laboratorio: responsabilidades, horarios, eventos e issues
- gamificacao com pontos, badges, leaderboard, loja e resgates
- notificacoes e acompanhamento de atividade

## Destaques do Sistema

- `Dashboard operacional`: quadro principal de tarefas e acompanhamento diario
- `Laboratorio`: horarios, agenda, responsabilidades, issues e avisos internos
- `Projetos`: membros, acompanhamento e organizacao por escopo
- `Relatorios`: consolidacao semanal de producao individual e por projeto
- `Gamificacao`: pontos, badges, ranking e recompensas

## Stack

- `Frontend`: Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui
- `Backend`: Route Handlers no App Router + modulos em `backend/modules/*`
- `Persistencia`: Prisma ORM + PostgreSQL
- `Autenticacao`: next-auth
- `Infra local`: Docker e docker compose

## Estrutura do Repositorio

```text
app/                 # Paginas, layouts e API routes do App Router
backend/             # Modulos, gateways, contratos, repositorios e composition root
components/          # Componentes de UI e features reutilizaveis
contexts/            # Contextos de estado e acesso aos dados no frontend
hooks/               # Hooks de comportamento e integracao na interface
lib/                 # Auth, prisma, utilitarios e funcoes compartilhadas
prisma/              # Schema, migrations e seeds
public/              # Arquivos estaticos, incluindo a identidade visual
docs/                # Documentacao tecnica, funcional e de manutencao
```

## Arquitetura em Alto Nivel

O projeto segue uma organizacao modular no backend, com composicao central em `backend/composition/root.ts`.

- `app/api/*` atua como camada HTTP
- `getBackendComposition()` resolve os modulos e dependencias
- `backend/modules/*` concentra regras de negocio por dominio
- `repositories` e `models` encapsulam persistencia e entidades

Isso evita espalhar regra de negocio nas rotas e facilita a evolucao por dominio.

## Modulos do Backend

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

## Rotas Principais da Aplicacao

- `/login` e `/register`
- `/dashboard`
- `/dashboard/projetos`
- `/dashboard/laboratorio`
- `/dashboard/weekly-reports`
- `/dashboard/loja`
- `/dashboard/profile`
- `/dashboard/leaderboard`
- `/dashboard/admin`

## API

As rotas de dominio da aplicacao ficam em `app/api/*` e, em regra, usam `getBackendComposition()` para resolver modulos do backend.

Obs.: rotas de autenticacao, registro e algumas rotas utilitarias ainda podem acessar `Prisma` ou utilitarios de `lib/*` diretamente.

Dominios principais expostos:

- `users`, `projects`, `tasks`
- `work-sessions`, `daily_logs`
- `weekly-reports`, `weekly-hours-history`
- `rewards`, `purchases`, `badges`, `user-badges`
- `issues`, `responsibilities`, `schedules`, `laboratory-schedule`, `lab-events`, `lab-notices`
- `notifications`

## Comportamento Atual das Tasks

- `public`: visivel no escopo de projeto ou laboratorio, com progresso individual por usuario
- `delegated`: visivel no projeto, com manipulacao restrita aos atribuídos
- `private`: visivel no projeto, com restricao semelhante a `delegated`
- `isGlobal=true`: representa task publica de laboratorio no modelo atual

## Setup Rapido (Local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar ambiente

Crie um arquivo `.env.local` com pelo menos:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/display-quest"
NEXTAUTH_SECRET="troque-isto"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Preparar o banco

```bash
npm run db:generate
npm run db:migrate:dev
# opcional para dev/teste
npm run db:seed
```

Observacao: o seed e manual e voltado para desenvolvimento. Ele nao roda automaticamente no startup.

### 4. Subir a aplicacao

```bash
npm run dev
```

## Scripts Uteis

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

## Docker

```bash
docker-compose up -d
docker-compose ps
docker-compose logs -f
```

## Documentacao

O repositorio hoje esta documentado em tres camadas:

### 1. Guias rapidos de manutencao

- `README.md`: visao geral do projeto, setup local e mapa do repositorio
- `app/README.md`: estrutura da interface, contextos, telas e manutencao do frontend
- `backend/README.md`: arquitetura backend, composition root, modulos e diretrizes de extensao

### 2. Documentacao tecnica e funcional base

- `docs/01-visao-geral-sistema.md`: panorama geral do sistema
- `docs/02-manual-do-usuario.md`: uso das funcionalidades principais
- `docs/03-regras-de-negocio.md`: regras operacionais centrais
- `docs/04-arquitetura-tecnica.md`: visao arquitetural e organizacao tecnica
- `docs/05-operacao-deploy.md`: orientacoes de operacao e deploy
- `docs/06-guia-de-manutencao-handover.md`: continuidade e manutencao do projeto
- `docs/07-modelo-de-dados.md`: entidades e relacoes principais

### 3. Documentacao APOO

O pacote em `docs/APOO/` organiza a documentacao formal no formato de Analise e Projeto Orientado a Objetos, incluindo:

- sumario executivo
- visao geral e escopo
- atores e glossario
- requisitos funcionais e nao funcionais
- catalogo e expansao de casos de uso
- regras de negocio
- maquinas de estado
- modelo conceitual
- projeto arquitetural
- padroes de projeto e rastreabilidade

Arquivo de apoio do processo de escrita:

- `docs/08-plano-acao-para-documentacao.md`

## Notas de Manutencao

- rotas em `app/api/*` nao devem instanciar `createXModule()` diretamente
- use `getBackendComposition()` para resolver dependencias do backend
- dependencias entre dominios devem ser centralizadas no composition root
- alteracoes estruturais relevantes devem refletir na documentacao em `docs/`
