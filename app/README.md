# Frontend (`app/`)

Documentacao de manutencao da UI (App Router, contextos, estados e efeitos).

## Papel da pasta

`app/` concentra:

- paginas da aplicacao (App Router)
- route handlers de API (`app/api/*`)
- layout global (`app/layout.tsx`, `app/client-layout.tsx`)

## Estrutura de layout e providers

Fluxo atual:

1. `app/layout.tsx`
2. `app/client-layout.tsx`
3. `SessionProvider` (`next-auth`)
4. `ThemeProvider`
5. Providers de dashboard (condicional por rota)

### Providers do dashboard (hoje)

Em `app/client-layout.tsx`:

- `UserProvider`
- `ProjectProvider`
- `TaskProvider` (somente em rotas de dashboard/projetos/admin)

Tambem injeta UI global:

- `AppHeader`
- `FloatingSessionTimer`

## Como a UI esta organizada (estado)

### 1. Contextos (`contexts/`)

Usados para estado global por dominio + IO com API.

Contextos principais:

- `auth-context.tsx`: sessao/login/register/logout via `next-auth`
- `user-context.tsx`: usuarios, atualizacao, pontuacao
- `project-context.tsx`: CRUD e lista de projetos
- `task-context.tsx`: tarefas, aprovacao/rejeicao/conclusao
- `reward-context.tsx`: loja/recompensas/compras
- `issue-context.tsx`: issues do laboratorio
- `responsibility-context.tsx`: responsabilidades e responsabilidade ativa
- `lab-events-context.tsx`: eventos do laboratorio
- `laboratory-schedule-context.tsx`: horarios do laboratorio
- `weekly-report-context.tsx`: relatorios semanais
- `notification-context.tsx`: notificacoes e unread count

Arquivos de suporte:

- `api-client.ts`: wrappers de chamadas REST do frontend
- `types.ts`: tipos usados pela UI

### 2. Hooks (`hooks/`)

Usados para estado local reutilizavel de fluxos que nao estao em provider global:

- `use-daily-logs.ts`
- `use-work-sessions.ts`
- `use-project-members.ts`

## Effects e states (padrao de manutencao)

### Onde fica cada tipo de estado

- `Context`: estado compartilhado por varias telas (dados de dominio)
- `Hook local`: fluxo reutilizavel de uma feature especifica
- `useState` na pagina/componente: estado de interface (dialog, filtros, loading local)

### Padrões atuais de efeito (`useEffect`)

Mais comuns no projeto:

- redirecionamento por autenticacao (`login` / `dashboard`)
- carga inicial de dados quando `user` fica disponivel
- refresh de dados ao mudar filtros
- sincronizacao de UI (timers, dialogs, datas)

### Regras praticas para manter a UI previsivel

- evite fetch direto em muitos componentes quando ja existe `Context`/hook para o dominio
- use `loading` + `error` no provider/hook sempre que houver IO
- deixe `useEffect` focado em sincronizacao (nao concentrar regra de negocio complexa)
- prefira atualizar estado local por patch (`map/filter`) apos mutacao bem-sucedida

## Telas e funcionalidades (App Router)

### Publicas

- `app/page.tsx`: redirecionamento para `login`/`dashboard`
- `app/login/page.tsx`: login por credenciais
- `app/register/page.tsx`: cadastro (aprovacao posterior)

### Dashboard

- `app/dashboard/page.tsx`: painel principal (Kanban de tarefas)
- `app/dashboard/admin/page.tsx`: painel administrativo (usuarios, projetos, tarefas, metricas)
- `app/dashboard/projetos/page.tsx`: projetos, detalhes, gestao e acompanhamento
- `app/dashboard/laboratorio/page.tsx`: responsabilidades, issues, eventos e horarios
- `app/dashboard/weekly-reports/page.tsx`: relatorios semanais e geracao
- `app/dashboard/loja/page.tsx`: loja, recompensas e compras
- `app/dashboard/profile/page.tsx`: perfil, logs, sessoes, badges
- `app/dashboard/leaderboard/page.tsx`: ranking por pontuacao

## Componentes (relacao com `app/`)

Pastas principais:

- `components/ui/`: base visual reutilizavel
- `components/features/`: blocos funcionais por dominio
- `components/admin/`: UI administrativa
- `components/forms/`: formularios e dialogs de entrada

## Como adicionar/editar funcionalidades na UI

### Se for uma feature nova

1. Identifique o dominio (`tasks`, `projects`, `issues`, etc.)
2. Reuse contexto existente; se nao houver, crie em `contexts/` ou `hooks/`
3. Crie componentes em `components/features/` (ou `admin/` se for painel admin)
4. Conecte a tela em `app/dashboard/...`
5. Se precisar de endpoint novo, alinhe com `backend/README.md`

### Se for manutencao/correcao

- localize primeiro a fonte de dados (context/hook)
- depois a tela que consome
- por ultimo os componentes de apresentacao

Isso evita corrigir efeito em componente visual quando o problema esta no provider.

## API routes dentro de `app/api/`

Apesar de estarem na pasta `app/`, pertencem ao backend de aplicacao.

- manutencao arquitetural: ver `backend/README.md`
- regra atual: usar `getBackendComposition()` (sem `createXModule()` direto nas rotas)

