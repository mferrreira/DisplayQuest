# DisplayQuest

<p align="center">
  <img src="./public/LOGO.png" alt="DisplayQuest" width="140" />
</p>

<p align="center">
  Plataforma web para gestão de laboratório, projetos, tarefas, relatórios, carga horária e gamificação.
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
  <a href="#visao-geral">Visão Geral</a> •
  <a href="#stack">Stack</a> •
  <a href="#estrutura-do-repositorio">Estrutura</a> •
  <a href="#setup-rapido-local">Setup</a> •
  <a href="#documentacao">Documentação</a>
</p>

## Visão Geral

O `DisplayQuest` centraliza a rotina do laboratório em uma única aplicação. O sistema combina acompanhamento de projetos, operação diária, registro de horas e mecânicas de gamificação para reduzir dispersão entre ferramentas e facilitar a continuidade do trabalho por novos membros.

Principais frentes cobertas pelo sistema:

- gestão de usuários e aprovação de contas
- projetos, membros e papéis de atuação
- tarefas com quadro Kanban e fluxo de revisão
- sessões de trabalho, logs diários e relatórios
- operação do laboratório: responsabilidades, horários, eventos e issues
- gamificação com pontos, badges, leaderboard, loja e resgates
- notificações e acompanhamento de atividade

## Destaques do Sistema

- `Dashboard operacional`: quadro principal de tarefas e acompanhamento diário
- `Laboratório`: horários, agenda, responsabilidades, issues e avisos internos
- `Projetos`: membros, acompanhamento e organização por escopo
- `Relatórios`: consolidação semanal de produção individual e por projeto
- `Gamificação`: pontos, badges, ranking e recompensas

## Stack

- `Frontend`: Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui
- `Backend`: Route Handlers no App Router + módulos em `backend/modules/*`
- `Persistência`: Prisma ORM + PostgreSQL
- `Autenticação`: next-auth
- `Infra local`: Docker e docker compose

## Estrutura do Repositório

```text
app/                 # Páginas, layouts e API routes do App Router
backend/             # Módulos, gateways, contratos, repositórios e composition root
components/          # Componentes de UI e features reutilizáveis
contexts/            # Contextos de estado e acesso aos dados no frontend
hooks/               # Hooks de comportamento e integração na interface
lib/                 # Auth, prisma, utilitários e funções compartilhadas
prisma/              # Schema, migrations e seeds
public/              # Arquivos estáticos, incluindo a identidade visual
docs/                # Documentação técnica, guia do usuário e material de manutenção
```

## Arquitetura em Alto Nível

O projeto segue uma organização modular no backend, com composição central em `backend/composition/root.ts`.

- `app/api/*` atua como camada HTTP
- `getBackendComposition()` resolve os módulos e dependências
- `backend/modules/*` concentra regras de negócio por domínio
- `repositories` e `models` encapsulam persistência e entidades

Isso evita espalhar regra de negócio nas rotas e facilita a evolução por domínio.

## Módulos do Backend

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

## Rotas Principais da Aplicação

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

As rotas de domínio da aplicação ficam em `app/api/*` e, em regra, usam `getBackendComposition()` para resolver módulos do backend.

Obs.: rotas de autenticação, registro e algumas rotas utilitárias ainda podem acessar `Prisma` ou utilitários de `lib/*` diretamente.

Domínios principais expostos:

- `users`, `projects`, `tasks`
- `work-sessions`, `daily_logs`
- `weekly-reports`, `weekly-hours-history`
- `rewards`, `purchases`, `badges`, `user-badges`
- `issues`, `responsibilities`, `schedules`, `laboratory-schedule`, `lab-events`, `lab-notices`
- `notifications`

## Comportamento Atual das Tasks

- `public`: visível no escopo de projeto ou laboratório, com progresso individual por usuário
- `delegated`: visível no projeto, com manipulação restrita aos atribuídos
- `private`: visível no projeto, com restrição semelhante a `delegated`
- `isGlobal=true`: representa task pública de laboratório no modelo atual

## Setup Rápido (Local)

### 1. Instalar dependências

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

Observação: o seed é manual e voltado para desenvolvimento. Ele não roda automaticamente no startup.

### 4. Subir a aplicação

```bash
npm run dev
```

## Scripts Úteis

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run arch:check` (dependency-cruiser, regras RG-01..RG-06)
- `npm run db:generate`
- `npm run db:migrate:dev`
- `npm run db:migrate:deploy`
- `npm run db:migrate:status`
- `npm run db:reset:local`
- `npm run db:safe-deploy`
- `npm run db:test:up` e `npm run db:test:setup` (banco de teste isolado em `127.0.0.1:5433`)
- `npm run check:env` (valida `NEXTAUTH_SECRET` e senha do banco)
- `npm run docs:build` e `npm run docs:check`

## Docker

Use o **plugin v2** (`docker compose`, com espaço). O `docker-compose` v1 (com hífen) está
obsoleto e não é mais suportado pelo Docker.

```bash
docker compose up --build -d   # build + sobe app e postgres
docker compose ps
docker compose logs -f
```

Nunca rode `docker compose down`: os volumes `postgres_data`, `uploads_data` e
`report_files_data` são eliminados junto, e junto vai o banco. O `up -d` já é idempotente.

O `docker-compose.override.yml` entra **implicitamente** (por convenção de nome do Compose) e
publica o Postgres apenas no loopback `127.0.0.1:5432`, para `psql` local e para
`tests/integration/entities-roundtrip.test.ts`. A base usa só `expose`, que não publica porta
no host. Isso vale também em produção, e é seguro porque nunca amarra em `0.0.0.0`.

Banco de teste isolado (nunca toca no banco de produção local):

```bash
npm run db:test:up       # sobe dq-dev-test-db em 127.0.0.1:5433
npm run db:test:setup    # migrate deploy + db:seed + tests/fixtures/g4-normalize.sql
```

## Documentação

Dois documentos, cada um um arquivo único e autocontido — abra direto no navegador, sem servidor.

**`docs/displayquest.html`** — documento técnico e de análise. Cobre visão geral e escopo, atores
e permissões, requisitos, catálogo e expansão de casos de uso, regras de negócio, máquinas de
estado, modelo conceitual, arquitetura, modelo de dados, padrões, rastreabilidade, operação e
manutenção. Os 33 diagramas UML (casos de uso, máquinas de estado, classes, arquitetura,
sequência, entidade-relacionamento e rastreabilidade de requisitos) estão embutidos no próprio
arquivo.

**`docs/guia-do-usuario.html`** — guia de uso, escrito para quem opera o sistema e não para quem
o mantém. É o modo *como fazer*: cada seção parte de um objetivo ("criar uma conta", "encerrar
uma sessão") e termina no resultado que o sistema produz, nomeando os controles pelo rótulo que
a interface mostra. Cobre entrada e cadastro, navegação, registro de trabalho, quadro de tarefas,
projetos, relatórios, laboratório, loja e ranking, perfil e notificações, administração, referência
de telas, mensagens de erro e perguntas frequentes. As 34 capturas de tela estão embutidas no
arquivo.

> O guia não duplica o documento técnico: arquitetura, modelo de dados, derivação das regras e API
> ficam no primeiro documento. O guia resolve "como faço" e remete para "por que é assim".

### Como os documentos são gerados

Ambos são **gerados**, não editados à mão:

```bash
npm run docs:build              # renderiza diagramas e monta os dois documentos (requer Docker)
npm run docs:build -- --no-render   # reaproveita os SVGs já gerados
npm run docs:build -- --only=usuario # monta só o guia do usuário
npm run docs:check              # integridade de caracteres das fontes
```

Fontes:

- `docs/src/*.md` — texto do documento técnico, um arquivo por capítulo, em ordem alfabética
- `docs/src-usuario/*.md` — texto do guia do usuário, na mesma convenção
- `docs/diagrams/*.puml` — diagramas, em notação UML
- `docs/screens/*.png` — capturas de tela usadas pelo guia
- `docs/theme/document.css` — folha de estilo, comum aos dois documentos

O bloco ` ```figure <id> titulo="…" ` embute o SVG de `docs/diagrams/<id>.puml`. O bloco
` ```foto <id> titulo="…" ` embute o PNG de `docs/screens/<id>.png`. Ambos aceitam corpo
markdown, que sai como legenda abaixo da figura.

### Capturar as telas do guia

```bash
node scripts/capture-user-guide.mjs                    # todas as telas
node scripts/capture-user-guide.mjs --only=quadro-tarefas,loja-participante
```

O script percorre as telas numa instância em execução, **verifica** que a tela certa foi alcançada
(URL final e textos esperados) e extrai do DOM os títulos, botões, abas, colunas e links realmente
exibidos. O extrato vai para `docs/.build/screens/manifest.json` e é a fonte usada para escrever o
guia: o texto do guia nomeia controles a partir do que a interface mostra, não de suposição sobre
o código.

- Credenciais em `docs/.capture.env` (gitignored). As capturas vão para `docs/screens/`, que é
  versionado.
- **Algumas capturas gravam.** Abrir diálogo e aba não altera nada; clicar em ação que persiste
  (como *Gerar em Lote*) grava no banco alcançado. Confira a lista antes de rodar contra dados
  reais.
- As capturas mostram dados reais da instância fotografada, inclusive nomes de pessoas.

### Gates do build de documentação

O build falha, e não emite aviso silencioso, se:

- um `.puml` não renderizar;
- um bloco cercado (` ```figure `, ` ```foto `, `:::callout`) ficar sem fechamento;
- uma figura ou captura for referenciada duas vezes;
- dois capítulos tiverem o mesmo título;
- um ` ```figure ` ou ` ```foto ` apontar para mídia que não existe.

Depois de mexer em `docs/src`, `docs/src-usuario` ou `docs/diagrams`, rode `npm run docs:build` e
confira se nenhum aviso `AVISO:` apareceu.

### Guias de manutenção por camada

- `README.md`: visão geral do projeto, setup local e mapa do repositório
- `app/README.md`: estrutura da interface, contextos, telas e manutenção do frontend
- `backend/README.md`: arquitetura backend, composition root, módulos e diretrizes de extensão

## Notas de Manutenção

- rotas em `app/api/*` não devem instanciar `createXModule()` diretamente
- use `getBackendComposition()` para resolver dependências do backend
- dependências entre domínios devem ser centralizadas no composition root
- alterações de comportamento devem vir com o teste da regra correspondente
- alterações estruturais devem passar por `npm run arch:check`
- alterações de comportamento ou de estrutura devem refletir em `docs/src` e `docs/diagrams`,
  seguidas de `npm run docs:build`; se a mudança é visível para quem usa o sistema, deve refletir
  também em `docs/src-usuario` e nas capturas
