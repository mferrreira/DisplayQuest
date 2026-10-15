# plan-v6 · SPEC — redistribuicao de paginas + refatoracao visual UI/UX

> Contrato de **comportamento** do `plan-v6`: o "o que" e o "why", sem o "como". Esta e a
> **fonte de verdade** do que sera implementado — se o codigo divergir daqui, o codigo
> esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.
> O "como" (ordem, arquivos, gates por etapa) fica no `PLAN.md` desta pasta.
>
> **Nota de evidencia:** as referencias `arquivo:linha` foram **medidas no repo em
> 2026-10-07** (primeira redacao) e **revalidadas em 2026-10-14, pos-plan-v5**. A
> revalidacao corrigiu numeros que o plan-v5 mudou — o dialogo do projeto saiu de 478 para
> **621 linhas** (e de 9 para **14 paineis**), o `ModernAdminPanel` de 1165 para **1339**,
> e a tabela de portas do dialogo mudou de **7 para 8** expressoes. Se uma linha mudar de
> novo, o numero daqui vira invalido — releia o arquivo, nao confie na citacao.

## 1. Proposito

Duas frentes na mesma rodada:

1. **Redistribuicao das paginas** (dono, 2026-10-14; DEC-181..DEC-184): decidir e executar
   o que aparece em **cada** rota — quais blocos, quais componentes (reusados antes de
   novos), onde cada autorizacao e aplicada de fato (**servidor** vs cliente) e o que fica
   **de fora**. O mapa medido por rota esta na §2.4 e os buracos de autorizacao na §2.9;
   os requisitos, em **RF-V6.11..RF-V6.16**.
2. **Linguagem visual** das referencias da skill `displayquest-ui` (DEC-105..DEC-114):
   alinhar hierarquia, cor, borda, tipografia, cards, badges, navegacao e composicao, e
   eliminar a recriacao desnecessaria de componentes que ja existem.

A redistribuicao **nao inventa funcionalidade** (DEC-112 continua valendo): ela move para
onde a coisa pertence o que ja existe, apaga o que e rota morta e fecha buracos em que a
unica autorizacao hoje e **do cliente**. Nada de tela nova, nada de dado novo.

Fronteira da funcionalidade: **apresentacao + navegacao** (`app/`, `components/`,
`features/`, `app/globals.css`, `components/layout/nav-config.ts`, docs de UI e a propria
skill). Zero mudanca de schema, zero endpoint, zero regra de negocio no dominio, zero
dependencia nova (RF-V6.10). O plano **remove** uma rota de pagina, **acrescenta guardas de
servidor** e **nao cria** nenhuma rota alem da ja decidida `/dashboard/projetos/[id]`.

Escopo de telas: **todas**, nesta rodada (decisao do dono, DEC-108), com as tres telas
centrais (Home, Projetos, Projeto) tendo onda propria.

## 2. Contexto atual (linha de base)

Fatos **medidos** no repo em 2026-10-06/07 antes de planejar. Nenhum aqui e suposicao.

### 2.1 Shell e navegacao

| Fato | Evidencia |
|---|---|
| Navegacao vive num **header sticky do topo**, nao numa sidebar | `components/layout/app-header.tsx:123` (`sticky top-0 z-50 w-full border-b`), container `h-16` em `:124` |
| Grupos de destino viram **pills `rounded-full`** no header | `app-header.tsx:57` (Item) e `:72` (grupo colapsavel) |
| Mesmo item se apresenta de 2 formas: grupo com varios destinos vira acordeao, grupo com 1 destino visivel e achatado em link direto | `nav-config.ts:35-108` + logica do header |
| `nav-config.ts` ja e a **fonte unica** (href/label/icone/visibilidade por `FEATURE_ACCESS`), consumida por header E menu mobile | `components/layout/nav-config.ts` (108 linhas), comentario em `:4`, `matchPrefix?: boolean` em `:27` |
| Menu mobile e um `Sheet side="left"` — **a unica coisa que parece sidebar hoje, e so no telefone** | `components/layout/mobile-menu.tsx:52` |
| Tokens `--sidebar-*` **ja existem** em light (`:46-53`) e dark (`:91-98`) e tem **ZERO uso** no codigo | `app/globals.css:46-53,91-98`; grep `bg-sidebar\|text-sidebar` = 0 |
| Utilitarios `.card-hover` (`:216`) e `.btn-hover` (`:221`) existem e tem **ZERO uso** (CSS morto) | `app/globals.css:216-223`; grep = 0 |
| `ModernButton.tsx` e um **segundo sistema de botao paralelo**, usado so pelo toggle de tema | unico consumidor: `components/layout/theme-toggle.tsx` |
| `Tabs`/`TabsContent`/`TabsList`/`TabsTrigger` importados e **sem uso** no dialog do projeto | `project-detail-dialog.tsx:8` (import morto; `Collapsible` **nao** esta no arquivo — quem o usa e `archive-section.tsx:7`) |

### 2.2 Padroes recriados em vez de reaproveitados

| Padrao repetido | Ocurrencias medidas |
|---|---|
| Cabecalho de pagina | **11 `<h1>` em 11 arquivos**, com **8 `className` distintos** (`text-2xl font-bold`, `text-2xl font-bold mb-6`, `mb-6 text-2xl font-bold`, `text-3xl font-bold tracking-tight`, `text-3xl font-bold text-foreground`, `text-3xl font-black tracking-tight md:text-4xl`, `text-3xl font-bold mb-4 text-center`, `text-2xl font-bold text-gray-900 dark:text-foreground`). Nenhum componente PageHeader |
| Stat card (idioma `items-center justify-between space-y-0 pb-2` + `text-2xl font-bold`) | **6 arquivos**: `app/(dashboard)/dashboard/projetos/page.tsx` (`:162,175,188,201`), `components/ui/project-detail-dialog.tsx` (`:341,351,361,371`), `components/features/project-manager-dashboard.tsx`, `components/features/volunteers-management.tsx`, `components/features/project-hours-stats.tsx`, `components/admin/AdminStatsCards.tsx` |
| Estado vazio (`text-center py-8` + icone + titulo + botao) | **~15 blocos**; 3 no escopo central |
| Mapa status→cor | **4 fontes de verdade**: `statusColors`/`statusLabels` duplicados em `components/features/project-list.tsx:15` e `:21` vs `components/ui/project-detail-dialog.tsx:79` e `:85`; `taskStatusColors` em `project-detail-dialog.tsx:91`; `priorityBadgeClass` (`:100`)/`statusBadgeClass` (`:113`)/`PRIORITY_LABEL` (`:85`)/`STATUS_LABEL` (`:92`) em `features/tasks/components/task-card.tsx` |
| Campo de busca | **2 implementacoes**: `Input pl-10` na pagina de Projetos (`projetos/page.tsx:223`) vs `<input>` escrito a mao em `features/tasks/components/board-toolbar.tsx:298` |
| Lista de links do projeto | **2 tratamentos**: `project-list.tsx:181-199` vs `project-detail-dialog.tsx:519-578` (form `:537,544`, render `:555-573`) |

### 2.3 Divergencias de linguagem visual (referencia vs codigo)

| # | Referencia diz | Codigo faz | Evidencia |
|---|---|---|---|
| D1 | Sidebar vertical persistente no desktop + header horizontal compacto; `anti-patterns > Excessive pills` proibe virar navegacao em pill | So header com pills `rounded-full` | `app-header.tsx:57,72` |
| D2 | `anti-patterns > Decorative gradients` | **39 ocurrencias de gradiente**: cabecalho de coluna, tons do cartao, badges, chip de pontos, gradiente do header | `board-column.tsx:57-61`, `task-card.tsx:103-124,376-384,451,505,511`, `app-header.tsx:148,150,192` |
| D3 | Colunas Kanban com distincao **sutil** e cores contidas | Cabecalho **gradiente saturado** (`from-emerald-600 to-green-500`, `from-purple-600 to-violet-500`, ...) com emoji como status | `board-column.tsx:55-62` |
| D4 | "Prefer a light border over a strong shadow" | `hover:shadow-md` (**5×**), `rotate-2 shadow-2xl` no arraste, `shadow-md` 12×, `shadow-lg` 10× | `project-list.tsx:123`, `task-card.tsx:393` |
| D5 | `anti-patterns > Card explosion` | Detalhe do projeto = **10 `<Card>` empilhados dentro de um Dialog**, 4 deles stat cards | `project-detail-dialog.tsx` (10 × `<Card>`) |
| D6 | Icones de linha simples, peso consistente | Emoji como status de coluna (`🕐 ✏️ 👁️ ⚠️ ✅`) e no titulo da tarefa (`⚡ 🌍`) | `board-column.tsx:57-61`, `task-card.tsx:431-432` |
| D7 | Hierarquia tipografica limpa | 11 `<h1>` com 8 classNames distintos; `font-black` no Ranking; `CardTitle` (padrao `text-2xl`) rebaixado a mao em quase todo uso | 2.2 / grep `<h1` |
| D8 | Superficies claras; cor por significado | **928 classes de paleta cravadas** em `.tsx` (sem token) — top: `text-blue-300` 27, `text-gray-500` 24, `text-red-400` 22, `text-green-300` 21, `text-gray-600` 21, `bg-blue-50` 19, `text-red-600` 17, `bg-blue-100` 16. Cada uma com par `dark:` casado a mao | grep global |
| D9 | Badges compactos e levemente coloridos | Badges `font-bold text-white` com degradê e `animate-pulse` (pts, prioridade, status, QUEST GLOBAL) | `task-card.tsx:497,501,505,511,451` |
| D10 | **Uma** regiao de titulo por pagina | Projetos tem **dois titulos empilhados**: `h1` da pagina + `h2 "Projetos"` dentro da aba | `app/(dashboard)/dashboard/projetos/page.tsx:143`, `project-list.tsx:88` |
| D11 | Busca e filtros formam uma toolbar coerente | Busca artesanal no quadro vs `Input` na Projetos; larguras `w-[220px]`/`w-[200px]` (`board-toolbar.tsx`), `md:w-64`/`md:w-48` (`projetos/page.tsx`) e `w-64` (`task-board.tsx`) sem padrao | `board-toolbar.tsx:165,185,215,282` vs `projetos/page.tsx:223,228` + `task-board.tsx:230` |
| D12 | Escala de raio **unica** | **7 valores** em uso: `rounded-md` 53, `rounded-full` 50, `rounded-lg` 49, `rounded` (solo) 21, `rounded-sm` 11, `rounded-xl` 10, `rounded-2xl` 4 | grep |
| D13 | Home: regiao de cabecalho + resumo + quadro dominante + coluna secundaria | Home = `h1 "Painel de Tarefas"` + `TaskBoard`; **sem regiao de cabecalho, sem resumo, sem coluna secundaria** — e o alvo TB nao ganha coluna secundaria (DEC-114); ganha regiao de cabecalho + resumo | `app/(dashboard)/dashboard/page.tsx:14-16` (18 linhas) |
| D14 | Projetos: **lista vertical** enriquecida + coluna de visao geral | **Grade de 2/3 colunas de cards** + 4 stat cards no topo | `project-list.tsx:121` (`grid gap-4 md:grid-cols-2 lg:grid-cols-3`) |
| D15 | pt-BR em tudo | `sr-only "Close"` em `components/ui/dialog.tsx:50` e `components/ui/sheet.tsx:71` (aparece como botao `Close` no manifesto DOM medido) | grep |

> **Fato util do dark:** o cabecalho de coluna **ja desliga o gradiente no dark**
> (`dark:bg-none dark:bg-slate-800` em `board-column.tsx:57-61`). Ou seja: no escuro
> esta correto, e no claro e que esta errado.

### 2.4 Mapa de paginas (medido por rota, pos-plan-v5)

**Como ler.** Esta e a linha de base **medida** de cada rota: o que aparece hoje, com que
componentes, que dado exibe, quem e restringido, e **onde** cada autorizacao e decidida
hoje. A coluna *Alvo* aponta o RF que muda a rota; rota sem alvo de redistribuicao so
herda os primitivos (RF-V6.7). Regra de leitura que governa tudo (DEC-113): **o backend e
a fonte de verdade e o front segue o back** — nenhum item deste mapa propoe dado ou regra
que a API nao tenha.

**As 13 rotas.**

| # | Rota | Arquivo (linhas) | O que aparece hoje | Gate de UI | Guarda de servidor | Alvo |
|---|---|---|---|---|---|---|
| 1 | `/dashboard` | `dashboard/page.tsx` (18) | `h1` + `TaskBoard` | nenhum | layout do grupo | RF-V6.4 |
| 2 | `/dashboard/projetos` | `projetos/page.tsx` (316) | 4 stat cards + filtros + Tabs Dashboard/Lista/Voluntarios | `VIEW_PROJECT_DASHBOARD` (`:122`), `showDashboard` (`:98` — troca por `DASHBOARD_PROJECT_MANAGER`, DEC-186), `showVolunteers` (`:99`) | layout do grupo | RF-V6.5, RF-V6.12 |
| 3 | `/dashboard/projetos/[id]` | **nao existe** | hoje e o `project-detail-dialog` num Dialog | 8 expressoes (§2.4.3) | **nenhum** (nao ha rota) | RF-V6.6, RF-V6.13 |
| 4 | `/dashboard/laboratorio` | `laboratorio/page.tsx` (103) | `h1` + Tabs Agenda/Responsabilidade/Reclamacoes | `VIEW_ALL_DATA` nas abas | layout do grupo | RF-V6.7 |
| 5 | `/dashboard/weekly-reports` | `weekly-reports/page.tsx` (458) | `h1` + Tabs Usuarios (semanal)/Relatorios de Projeto | `VIEW_WEEKLY_REPORTS` (`:173`), `MANAGE_USERS` (`:215`) | layout do grupo | RF-V6.11 |
| 6 | `/dashboard/profile` | `profile/page.tsx` (342) | midia + `h2` nome + Tabs Atividade/Registros/Configuracoes | nenhum (aba `admin` comentada) | layout do grupo | RF-V6.7 |
| 7 | `/dashboard/leaderboard` | `leaderboard/page.tsx` (280) | `h1` `font-black` + podio + tabela | nenhum | layout do grupo | RF-V6.7 |
| 8 | `/dashboard/loja` | `loja/page.tsx` (490) | Tabs Recompensas/Minhas Compras/Aprovacoes/Gerenciar | `MANAGE_REWARDS` (`:51`) | layout do grupo | RF-V6.7, RF-V6.15 |
| 9 | `/dashboard/loja/gerenciar` | `loja/gerenciar/page.tsx` (422) | 3 abas Recompensas/Pendentes/Historico | `MANAGE_REWARDS` (`:54,:73`) | layout do grupo | **RF-V6.15 (removida)** |
| 10 | `/dashboard/admin` | `admin/page.tsx` (117) | `ModernAdminPanel` com 8 abas | `COORDENADOR \|\| GERENTE` (`:52`) | **NENHUM** (§2.9-A) | RF-V6.14, RF-V6.12 |
| 11 | `/login`, `/register` | `(auth)/{login,register}/page.tsx` (140, 162) | form, **zero headings** | nenhum | — | RF-V6.10 |
| 12 | `/dashboard/project-reports/[id]/print` | `.../print/page.tsx` (150) | folha de impressao do relatorio | nenhum | layout do grupo | RF-V6.7 |
| 13 | `/` | `app/page.tsx` (27) | redireciona, sem UI propria | — | — | — |

**O que decide `server` vs `client` (a regra, nao a lista).** As 13 paginas sao **client
components**; os unicos pontos server hoje sao `app/layout.tsx` e
`app/(dashboard)/layout.tsx:17-21` (guard de sessao). Decisao do dono (2026-10-14): **o
cliente continua**, com as rotas de API como estao; nao ha migracao para RSC. O que o
plano corrige e **onde** a decisao de autorizacao e tomada:

- **S1** — toda decisao que **pode negar** mora no servidor. O cliente **esconde** o que o
  servidor nao daria; nunca e a ultima palavra (RF-V6.16).
- **S2** — o dado restrito continua saindo so pela API: o cliente nao recebe o que nao pode
  ver. Nao ha, neste plano, filtro de seguranca no cliente.
- **S3** — a guarda de entrada de uma rota que hoje so o cliente faz (a unica e
  `/dashboard/admin`) passa a um `layout.tsx` de segmento, server, decidindo pela chave de
  `FEATURE_ACCESS`. A **frase** de negacao existente e preservada (RF-V6.16, R3).
- **S4** — o que permanece no cliente e so o que nao pode dar acesso a nada: esconder
  botao, desabilitar acao, mostrar estado vazio.

#### 2.4.1 Home — `/dashboard`

- **Aparece:** `h1 "Painel de Tarefas"` (`page.tsx:13`) + `<TaskBoard/>` (`:14`). Nada mais:
  a pagina tem **18 linhas**.
- **Componentes:** `features/tasks/components/task-board.tsx` (372) → `board-toolbar.tsx`
  (328), `board-column.tsx` (177), `task-card.tsx` (679), `archive-section.tsx` (75). E a
  tela **melhor testada** do repo: 11 arquivos em `features/tasks/__tests__/` + o e2e.
- **Dados:** tarefas (todas, do `TaskProvider`), projetos (`useProjects`), `user.points`.
  Nada de terceiro e sensivel; nome de responsavel aparece no cartao e no filtro de pessoas.
- **Alvo:** regiao de cabecalho + blocos de resumo **acima** do quadro, 5 colunas mantidas,
  largura horizontal cheia (DEC-114). Fonte dos numeros: so o que a pagina ja carrega.
- **Fica de fora:** feed de `Atividade recente`, `Status do sistema`, fetch de ranking,
  **coluna secundaria** — DEC-112/114.

#### 2.4.2 Projetos — `/dashboard/projetos`

- **Aparece:** `h1` (`:143`) + 4 stat cards (`:162,175,188,201`) + filtros + `Tabs`
  Dashboard/Lista/Voluntarios (`:249`) + 2 dialogos. **Zero testes.**
- **Quem ve o que (hoje, no corpo da pagina):** `showDashboard` = `roles.includes(
  "GERENTE_PROJETO")` (`:98`) e `showVolunteers` = `GERENTE_PROJETO || hasGodMode`, com
  `hasGodMode` = `COORDENADOR || GERENTE` (`:39-41`). Consequencia medida: **COORDENADOR e
  GERENTE nao veem a aba Dashboard**; veem Lista + Voluntarios.
- **Correcao decidida (DEC-186, unica excecao registrada de "nenhum conjunto muda de
  valor"):** a aba Dashboard passa a ser governada pela chave nomeada
  `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` — o gatilho
  local vira chave (RF-V6.16 R2) e **ninguem perde o que via**: COORDENADOR e GERENTE
  passam a ver a aba, `GERENTE_PROJETO` continua. `ProjectManagerDashboard` segue
  filtrando por `leaderId === user?.id` (`project-manager-dashboard.tsx:31`), entao quem
  nao lidera projeto nenhum ve o estado vazio que o componente **ja tem** (`:190-197`,
  "Nenhum projeto atribuido"): nenhuma funcionalidade nova entra por causa disso. O valor
  coincide com `DASHBOARD_VOLUNTEERS`, mas os dois conjuntos governam **recursos
  diferentes** (aba do Admin x aba de Projetos) — sao duas chaves de propósito.
- **Dados:** projetos pelo **contexto legado** `useProject` (`:46`) — nao o `useProjects`
  TanStack do quadro: dois caminhos de dado para a mesma coisa. Contagens derivadas em
  `:66-68`. Membros e horas por pessoa vem de `/volunteers`.
- **Restrito:** a aba Voluntarios exibe **horas e pontos de terceiros**.
- **Alvo:** grade de 2/3 colunas vira **lista vertical** enriquecida (RF-V6.5); a aba
  **Voluntarios sai daqui** para o Painel Administrativo (RF-V6.12, DEC-182); os gatilhos
  locais viram chaves nomeadas sem mudar o conjunto medido (RF-V6.16).
- **Fica de fora:** tags, avatar de membro na lista (N+1).

#### 2.4.3 Projeto — `/dashboard/projetos/[id]` (rota nova)

- **Hoje nao e rota:** e o `project-detail-dialog.tsx` (**621 linhas**, **14 paineis**, com
  scroll duplo em `:176` — `DialogContent` com `h-[90vh]` **mais** `overflowY: 'auto'` inline —
  e `:224` — bloco interno `overflow-y-auto max-h-[70vh]`) aberto num `Dialog`. **Zero testes.**
- **Os 14 paineis:** `ProjectMediaHeader` (capa/logo), cabecalho (nome + status + `Criado
  em`), descricao, dados do projeto (+ `ProjectTimeProgress`), `ProjectDeliverablesPanel`,
  `ProjectAttachmentsPanel`, `ProjectCronogramaPanel`, `ProjectTechnicalReportsPanel`,
  `ProjectCertificatesPanel`, 4 stat cards de tarefa, progresso, `ProjectReportsPanel`,
  `ProjectHoursStats`, `ProjectMembersManagement`, `ProjectLeaderLogs` — mais os dialogos
  `TaskDialog` e `BacklogDialog`.
- **As 8 expressoes de porta (revalidadas 2026-10-14; eram 7 contadas em 2026-10-07):** ver
  §8.4, que congela o inventario bloco a bloco. A 8a (`canManageProjectFiles`, `:165-171`)
  **ja existia** e nao era contada — ela sozinha governa 6 dos 20 blocos. Cada uma
  **preserva o resultado identico**.
- **Dados:** projeto, tarefas, membros, horas **de terceiros**, entregaveis, anexos,
  relatorios tecnicos, atestados, cronograma, logs. E a segunda tela mais exposta do
  sistema, depois do admin.
- **Alvo:** vira **rota** com as **5 abas da referencia** (DEC-183, RF-V6.13): Visao geral,
  Tarefas, Membros, Arquivos, Configuracoes, com rail direito (Informacoes, Membros,
  Atividade). Nenhum bloco some — o checklist de §8.4 e o contrato.
- **Fica de fora:** qualquer bloco de `Atividade recente` ou grafico.

#### 2.4.4 Relatorios — `/dashboard/weekly-reports`

- **Aparece:** `h1 "Relatorios Semanais"` (`:190`) + `Tabs` `Usuarios (semanal)` (`:203`) e
  `Relatorios de Projeto` (`:204`) + `WeeklyReportDetail`, `ProjectReportsPanel`,
  `PERIOD_LABELS`. Gate de pagina `VIEW_WEEKLY_REPORTS` (`:173`); o card de **geracao em
  lote** e restrito a `MANAGE_USERS` (`:215`).
- **Dados:** relatorios semanais por usuario; relatorios por projeto; nomes e papeis de
  terceiros (`:319`), horas.
- **Alvo (DEC-181):** destino unico com **3 abas** — por usuario (semanal), por projeto
  (tecnico) e **atestados** — mais um **assistente de 3 passos** que reune os tres fluxos
  de geracao que hoje vivem em 3 lugares. O `h1` passa a ser **Relatorios** e o rotulo do
  nav acompanha.
- **Fica de fora:** a aba **Templates** — o produto nao tem fonte de template para uma tela
  propria (DEC-112); os templates oficiais sao asset de leitura do backend (DEC-128/130).
- **Rota (DEC-185):** o diretorio **continua** `/dashboard/weekly-reports`; so o `h1` e o
  rotulo do nav viram **Relatorios**. O caminho nao aparece para o usuario final e renomear
  tocaria `nav-config`, a captura do guia e o e2e — custo sem ganho visivel.

#### 2.4.5 Admin — `/dashboard/admin`

- **Aparece:** `ModernAdminPanel.tsx` — **1339 linhas**, **zero testes**, **8 abas**:
  `overview`, `users`, `projects`, `hours`, `tasks`, `notifications`, `badges` e `settings`
  (`:375-403`). A aba `settings` (`:994`) e **placeholder**.
- **Autorizacao hoje (o buraco):** `isAdmin = roles.includes("COORDENADOR") ||
  roles.includes("GERENTE")` (`:52`) — reimplementacao por extenso de `DASHBOARD_ADMIN`
  (`permissions.ts:28`), **mesmo conjunto**, sem divergencia de valor. Sem permissao, a
  pagina **renderiza** `h2 "Acesso Negado"` (`:75`) com **HTTP 200** — nao ha guarda de
  servidor e a pagina nao redireciona (§2.9-A).
- **Dados:** a tela mais sensivel do sistema — usuarios (inclusive e-mail), pontos de
  terceiros, papeis, **compras de terceiros** (`purchase-approval`), horas de todos.
- **Alvo:** guarda de servidor pelo segmento (RF-V6.16, S3) decidindo por `DASHBOARD_ADMIN`;
  **corte da aba `settings`** (placeholder, DEC-184); cada aba com a **chave que a governa**
  e aba sem permissao passa a **dizer o motivo** em vez de renderizar vazia; a aba
  **Voluntarios** chega aqui (RF-V6.12).
- **Fica de fora:** graficos/`recharts` (nao esta no `package.json`), inventario, gamificacao.

#### 2.4.6 Loja — `/dashboard/loja` (+ a rota morta)

- **Aparece:** `Tabs` Recompensas (`:239`), Minhas Compras (`:242`), **Aprovacoes**
  (`:247`) e **Gerenciar** (`:255`), as duas ultimas sob `MANAGE_REWARDS` (`:51`). A aba
  Gerenciar **ja faz** o CRUD de recompensa (`:347+`: adicionar/editar/excluir).
- **Dados:** recompensas, compras proprias e, na fila, **compras de terceiros** + pontos.
- **Divergencia medida:** `loja/page.tsx:51` usa `MANAGE_REWARDS` (COORDENADOR, GERENTE,
  LABORATORISTA) para mostrar a aba, mas `contexts/reward-context.tsx:68` calcula o proprio
  `canManageStore` como `LABORATORISTA || COORDENADOR` — **sem GERENTE**. Um GERENTE ve a
  aba Aprovacoes e o contexto entrega a lista das **proprias** compras (§2.9-C).
- **Rota morta:** `/dashboard/loja/gerenciar` (422 linhas, 3 abas, `MANAGE_REWARDS`) tem
  **zero referencia de entrada** no repo — `grep -rn 'loja/gerenciar'` nos `.ts/.tsx` de
  `app`, `components`, `features`, `lib` volta **vazio**, e o `nav-config` aponta para
  `/dashboard/loja`. E duplicata da aba Gerenciar (RF-V6.15).
- **Fica de fora:** historico de compras por terceiro fora da fila de aprovacao.

### 2.5 Limites de dados (nao da para mostrar, nao pode ser inventado)

| Elemento da referencia | Existe? | Evidencia |
|---|---|---|
| Tags de projeto/tarefa | **NAO** | `entities/project.ts:9-18` nao tem tags; `Task` tambem nao |
| Membros com avatares na LISTA | **NAO** (N+1) | `members` so via `GET /api/projects/[id]/members` (`lib/api/endpoints/projects.ts:47-53`); o `GET /api/projects` nao traz |
| Progresso do projeto | **SIM** (derivado de `tasks`, ja carregadas na pagina) | `project-manager-dashboard.tsx:70-75` ja calcula |
| Contagens de status | **SIM** | `projetos/page.tsx:66-68` ja conta active/completed/archived |
| `Atividade recente` / feed | **NAO** | nenhuma API de feed |
| Inicio/Termino do projeto | **SIM** (desde o plan-v5, DEC-132) | `entities/project.ts:21-22` (`startDate`/`endDate`, data civil `String`); o extrato antigo ("so `createdAt`") morreu |
| Numero PROPPI do projeto | **SIM** (desde o plan-v5, DEC-140) | `entities/project.ts:26` (`proppiNumber`) |
| Dados de pessoa (CPF, curso, bolsa, nivel) | **SIM**, com CPF **restrito** | `users.cpf` sai so por `GET /api/users/[id]/profile` e sob `canViewFullUsers` (DEC-147) |
| Dados do vinculo (categoria, carga horaria, situacao, data de entrada) | **SIM** (desde o plan-v5, DEC-149) | `project_members`; alimenta `carga_8`/`carga_20` do atestado |
| Grafico (donut) "Por status" | **sem dependencia** | `recharts` **nao** esta no `package.json`; nenhum componente de chart no repo |
| Busca global transversal (Cmd/Ctrl+K) | **NAO** | a busca e so do quadro |
| Destinos `Times`, `Inventario`, `Gamificacao` como rotas | **NAO** | nao existem em `nav-config.ts` |

### 2.6 Tema escuro — o CSS ja esta certo, o texto e que nao

O bloco `.dark` em `app/globals.css:55-99` **ja implementa o que a referencia mostra**
(leitura da imagem `home-darkmode.png` por modelo com visao, duas leituras
independentes):

| Medido na referencia | Token | Valor no CSS |
|---|---|---|
| pagina escura azul-tint | `--background` | `222 15% 8%` |
| sidebar uma tonalidade mais escura | `--sidebar-background` | `222 15% 7%` (`:91`) |
| card mais claro que a pagina | `--card` | `222 13% 11%` |
| borda hairline visivel 1px | `--border` | `220 10% 20%` |
| texto off-white (nao `#fff`) | `--foreground` | `210 20% 93%` |
| metadado | `--muted-foreground` | `218 11% 65%` |
| azul mais saturado que no light | `--primary` | `217 91% 50%` (light: `221 83% 53%`) |
| acentos semanticos clareados | `--success/info/warning` | `158 64% 52%` / `213 94% 68%` / `38 92% 56%` |
| escada de elevacao | `background < card < popover` | `8% < 11% < 14%` |

Leitura confirmada da imagem: separacao por **ton + borda** (sombra praticamente
ausente), **sem** `#000`/`#fff` puro, **sem** glow/neon, badges continuam **fill
translucido + texto da mesma cor**, colunas mantem o matiz como **tinta escura de baixa
luminancia** (nao pastel claro levado para o dark), hierarquia de texto em 3 tons
distinctos, e o resultado e **re-autorado, nao invertido**.

**Lacunas na skill** (arquivos sob `.opencode/skills/displayquest-ui/`), medidas em
2026-10-07:

| Arquivo:linha | Lacuna |
|---|---|
| `SKILL.md:22-24` | lista **2 das 5** imagens (`home.png` `:23`, `projects.png` `:24`); **faltam `project.png`, `home-darkmode.png` e `reports.png`** — as 5 estao em `references/visual-examples/`, e nao em `visual-examples/` na raiz da skill |
| `SKILL.md` (inteiro) | nenhuma mencao a tema escuro |
| `references/design-system.md:5` | "Use a light interface as the default visual direction" — le como "dark e opcional" |
| `references/design-system.md:93` | "Decorative handwritten typography is restricted to small visual accents" |
| `references/visual-language.md:5` | "The interface is light, clean, friendly and academic" |
| `references/visual-language.md:12` | "restrained pastel colors" sem qualificar tema |
| `references/visual-language.md:16-17,30,35,48,54` | **manda usar** ilustracoes desenhadas a mao e texto manuscrito — dono decidiu que nao entram (DEC-109) |
| `references/anti-patterns.md:50-54` | 2o paragrafo (`:54`) **obriga** seguir o estilo desenhado a mao |
| `references/layout-patterns.md:135` | "Decorative illustrations can occupy some empty areas" |
| `references/components.md:36` | "project icon or illustration" |
| `.opencode/agents/ui-reviewer.md:31` | prioridade **"9. use of illustrations"** — o revisor seria pago para EXIGIR ilustracao (DEC-109) |
| `.opencode/commands/ui-refactor.md:33` | "Run the project's relevant type checking, linting and tests" e vago; o repo tem gate concreto com baseline |

### 2.7 O que nao pode mudar (travado por teste)

| Travado por | Seletor/fragmento |
|---|---|
| `tests/e2e/task-board.spec.ts:67,132,164,180,276,295,307,343,375,466,499` | `getByLabel("Coluna <titulo>")` |
| `task-board.spec.ts:396` | `getByRole("heading", { name: "A Fazer", exact: true })` |
| `task-board.spec.ts:477,507` | `"Ordenar tarefas de A Fazer"` |
| `task-board.spec.ts:68,155,320` | `"Ver detalhes de ..."` |
| `task-board.spec.ts:160,325` | `"Ações para ..."` |
| `task-board.spec.ts:299` | `"Buscar tarefas por título"` |
| `task-board.spec.ts:100,216` | `testid` `points-total`, `points-delta` |
| `features/tasks/__tests__/board-people-filter.test.tsx:83,149` | `combobox "Filtrar tarefas por pessoa"` |
| `features/tasks/__tests__/*` (11 arquivos) | mesmos fragmentos + toasts + estados vazios |
| `tests/e2e/shell.spec.ts:31` | `page.locator("header")` visivel |
| `task-card.tsx:179,408,427,492,542,586,611` | `aria-label` — `Ações para`, `Arrastar tarefa`, `Ver detalhes de`, `Progresso de`, `Concluir subtask`, `Aprovar tarefa`, `Rejeitar tarefa` |

**Sem teste nenhum hoje** (precisam de caracterizacao ANTES de mudar): `ProjectList`,
`ProjectDetailDialog`, `nav-config`, `AppHeader`, `MobileMenu`, `ModernAdminPanel`.

Gotchas que a execucao precisa respeitar (AGENTS.md): shims Radix em `tests/setup.ts`;
jsdom sem `window.localStorage`/`window.matchMedia` (Toaster do Sonner exige stub
**local** ao teste); `getByLabel` casa por substring (rotulo novo nao pode conter o
rotulo do elemento que ele governa); `userEvent.setup({delay:null})` sob carga; jsdom sem
`window.confirm`; rejeitada nao tratada fecha o gate com exit 1.

### 2.8 Linha de base de teste (medido 2026-10-14, lote `V5-fix-1`)

- **G0** `arch:check`: **1026 modulos / 4383 dependencias**, zero violacao, allow-list vazia
- **G3** `tests/unit` + `features`: **157 arquivos / 2134 testes** verdes (140/1990 so em
  `tests/unit`)
- Suite completa: **172 arquivos / 2264 testes**
- **`tsc --noEmit` NAO fecha em 0 nesta branch**: 1 erro **pre-existente** em
  `features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105`, conferido com
  `git stash`. Consequencia para o gate: nenhuma onda pode exigir "tsc 0" antes de esse
  erro sair — o criterio e **nao piorar**, e o V6-0 decide (consertar ou registrar).
- e2e do quadro: **2 passando + 1 falha conhecida** (cartao a mais na coluna, dado
  legitimo da instancia — confirmar com `git stash` antes de cacar regressao) **+ 5
  "did not run"** (spec serial); e2e do shell: **5 passando**

### 2.9 Buracos de autorizacao, de vocabulario e de apresentacao (medidos pos-plan-v5)

A regra que orienta todos: **o backend e a fonte de verdade e o front segue o back**
(DEC-113). Onde ha divergencia, o conserto e fazer o cliente **pedir o que o servidor ja
permite** — nunca ampliar o servidor para caber no cliente.

| # | Buraco | Medicao | Fecha em |
|---|---|---|---|
| A | `/dashboard/admin` **sem guarda de servidor** | `admin/page.tsx:52` decide no cliente com a mesma lista de `DASHBOARD_ADMIN` (`permissions.ts:28`); a negacao e um corpo `h2 "Acesso Negado"` (`:75`) servido com **HTTP 200**, e a pagina nao redireciona | RF-V6.16 (S3) |
| B | `/dashboard/loja/gerenciar` e **rota morta** | 422 linhas, `MANAGE_REWARDS` (`:54,:73`); `grep -rn 'loja/gerenciar'` nos `.ts/.tsx` de `app components features lib` volta **vazio**, e o `nav-config.ts:73` aponta para `/dashboard/loja` | RF-V6.15 |
| C | A fila de aprovacoes **nao chega ao GERENTE** | `loja/page.tsx:51` usa `MANAGE_REWARDS` (tem GERENTE) para mostrar a aba, mas `contexts/reward-context.tsx:68` calcula `canManageStore = LABORATORISTA \|\| COORDENADOR` — sem GERENTE — e entao chama `fetchPurchases(userId)`, escopando a si mesmo. O **backend ja permite**: `purchase-query-scope.ts:48-49` autoriza por `MANAGE_PURCHASES` (os mesmos 3 papeis) e `:83-85` devolve **todas** as compras quando o ator gerencia. O cliente sub-pede | RF-V6.16 (R5) |
| D | `DASHBOARD_PROJETOS` e **chave morta** | `permissions.ts:30` — **1** ocorrencia no repo inteiro (a propria definicao) | RF-V6.16 (R4) |
| E | `MANAGE_REWARDS` **duplicada** nas duas matrizes | `permissions.ts:17` (PERMISSIONS) e `:39` (FEATURE_ACCESS), mesmo valor | RF-V6.16 (R4) |
| F | A **mesma lista** com **duas chaves** na pagina e no nav | `weekly-reports/page.tsx:173` (`VIEW_WEEKLY_REPORTS`) vs `nav-config.ts:57` (`DASHBOARD_WEEKLY_REPORTS`) — conjuntos identicos | RF-V6.16 (R4) |
| G | `showDashboard`/`showVolunteers` **reimplementam papeis no corpo** da pagina; nao existe chave | `projetos/page.tsx:98-99` + `hasGodMode` (`:39-41` = `COORDENADOR \|\| GERENTE`) | RF-V6.16 (R2) + RF-V6.12 — **decidido**: `showDashboard` vira `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (DEC-186) e `showVolunteers` vira `DASHBOARD_VOLUNTEERS` (DEC-182) |
| H | **13 de 13** paginas sao client; os unicos pontos server sao os `layout.tsx` — toda decisao de pagina e do cliente | `find app -name 'page.tsx'` = 13 vs `layout.tsx` = 5 (so 2 fazem guarda) | RF-V6.16 (S1) |
| I | `metadata.title` e a **mesma string generica** ("Sistema de Gerenciamento de Tarefas") em todas as telas — e o mesmo texto e o `h1` do intersticial `/` (`app/page.tsx:22`) | `app/layout.tsx`; **nenhuma** das 13 `page.tsx` pode exportar `metadata` (Next: server-only) | RF-V6.2 (R5) — **decidido**: titulo por tela por efeito no cliente dentro do `PageHeader`, sem RSC e sem `layout.tsx` por segmento; o fallback de `app/layout.tsx` e o `h1` do intersticial passam a citar o produto (DEC-188, onda V6-10) |

**O que NAO e mudanca de permissao — com UMA excecao registrada.** Nenhum outro conjunto
de papeis medido acima muda de valor: as chaves novas nascem com o **valor medido**, e o
caso (C) se fecha pela lista que **o dono ja usa na tela** (`MANAGE_REWARDS`, que o servidor
ja aplica como `MANAGE_PURCHASES`). O outro conjunto *novo* e `DASHBOARD_VOLUNTEERS`
(`COORDENADOR`, `GERENTE`, `GERENTE_PROJETO`), que e exatamente o `showVolunteers` de
`projetos/page.tsx:99` — nenhum papel ganha acesso a algo que nao tivesse. A **excecao** e
a aba Dashboard de Projetos: o dono respondeu que a invisibilidade de COORDENADOR/GERENTE
ali e **bug** (ASK-V6-04) e mandou alinhar com o `hasGodMode` da propria pagina — a chave
`DASHBOARD_PROJECT_MANAGER` nasce com `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`
(**DEC-186**). E mudanca de visibilidade pretendida, aditiva: nenhum papel perde acesso.

**Quirk corrigido por decisao do dono (DEC-186).** `showDashboard` (`:98`) era
`GERENTE_PROJETO` **so**, e COORDENADOR e GERENTE nao viam a aba Dashboard da pagina de
Projetos. O dono classificou isso como **bug** e mandou alinhar com o `hasGodMode` da
propria pagina (`:39-41`) em 2026-10-14. O gatilho passa a ser a chave nomeada
`DASHBOARD_PROJECT_MANAGER` e o conjunto vira a **uniao** `COORDENADOR ∪ GERENTE ∪
GERENTE_PROJETO` — ninguem perde a aba que ja via. Quem nao lidera nenhum projeto ve o
estado vazio que o `ProjectManagerDashboard` **ja** renderiza (`:190-197`).

## 3. Atores e papeis

| Ator | Papel | Interacao nesta funcionalidade |
|---|---|---|
| Dono do DisplayQuest | decide a linguagem visual | fornece as referencias, decide as DEC-105..112, aprova visualmente cada onda |
| Usuario logado (todos os papeis) | usa as telas | navega, filtra, busca, arrasta cartoes, cria/edita/aprova — **o comportamento nao muda** |
| Coordenador / Gerente | portas de gestao | ve os mesmos botoes de hoje nas mesmas telas — incluindo o conjunto de **Voluntarios** (`COORDENADOR`, `GERENTE`, `GERENTE_PROJETO`), que muda de lugar (RF-V6.12) e **nao** de tamanho. **Unica excecao de visibilidade do plano:** ganham a aba **Dashboard** da pagina de Projetos, que hoje so o `GERENTE_PROJETO` ve e o dono classificou como bug (DEC-186) |
| Usuario sem a permissao de uma aba | ve o motivo, nao o vazio | RF-V6.14: aba sem chave **explica** por que; a guarda de entrada responde no **servidor** (RF-V6.16) |
| Lider de projeto | gestao do proprio projeto | mesmas portas (`leaderId === user.id`) |
| Agente `build` | executa `/ui-refactor <alvo>` | implementa a onda, roda os gates, reporta |
| Agente `ui-reviewer` | executa `/ui-review <alvo>` | avalia read-only (`permission.edit: deny`), agrupa Must/Should/Optional |

## 4. Requisitos funcionais

### RF-V6.1 — Cor, borda, raio e sombra por token

- **Descricao:** toda tela do escopo passa a usar o sistema de tokens do projeto
  (`--primary`, `--success`, `--info`, `--warning`, `--border`, `--muted-foreground`,
  `bg-card`, `text-foreground`, ...) no lugar de classes de paleta cravadas, degradês e
  sombras ad-hoc. Nenhuma tela do escopo ganha `bg-gradient-*`.
- **Fronteira:** `app/`, `components/`, `features/`
- **Entradas/Saidas:** visual; nenhuma entrada de dados nova
- **Cenario principal:**
  Given uma tela do escopo
  When a tela e renderizada em tema claro e em tema escuro
  Then a hierarquia de superficies se mantem usando tokens, sem `bg|text|border-<paleta>-<n>`
- **Regras:**
  - R1: degradê so e aceito se registrado como excecao numa DEC (nenhum hoje).
  - R2: `#000` e `#fff` puro nao aparecem em nenhuma tela.
  - R3: escala de raio unica; `rounded` solo e `rounded-2xl` sao do escopo da
    unificacao.
  - R4: sombra nao substitui borda; no tema escuro a separacao e ton + borda.

### RF-V6.2 — Primitivos compartilhados (um jeito so de cada conceito)

- **Descricao:** os cinco padroes hoje recriados passam a existir uma unica vez:
  `PageHeader`, `StatCard`, `EmptyState`, `SearchInput` e um modulo `status.ts` de
  status→badge/label.
- **Fronteira:** `components/ui/` (primitivos novos) + consumidores
- **Cenario principal:**
  Given uma pagina do escopo
  When ela renderiza seu cabecalho / um bloco de resumo / um estado vazio / uma busca /
  um badge de status
  Then ela usa o primitivo compartilhado, nao uma reimplementacao local
- **Regras:**
  - R1: `PageHeader` renderiza exatamente **um `<h1>`** por pagina; o texto visivel nao
    muda (so a estrutura em volta).
  - R2: `status.ts` e a **unica** fonte de status→cor/label; `statusColors`/`statusLabels`
    locais somem.
  - R3: primitivos sao puros (props declarativas), sem busca de dados e sem `useContext`.
  - R4: variantes de badge usam `--success/--info/--warning`, que ja tem variante dark
    automatica — some o par `dark:` casado a mao.
  - R5 (**DEC-188**): `PageHeader` **tambem declara o titulo do navegador** — um efeito no
    cliente escreve `document.title = "<titulo da tela> · DisplayQuest"`. Nao ha RSC nesta
    correcao, nem `layout.tsx` por segmento: as 13 `page.tsx` seguem client e
    `metadata` segue server-only. `app/layout.tsx` mantem o fallback (rotas sem
    `PageHeader`, como o intersticial `/`), com o **nome do produto** no lugar da string
    generica medida. Toda tela que adota o primitivo passa a ter titulo proprio **sem
    trabalho extra**.

### RF-V6.3 — Shell de navegacao: sidebar persistente + header compacto

- **Descricao:** o desktop ganha sidebar vertical persistente construida a partir do
  `nav-config.ts` existente; o `<header>` continua existindo, mas so com identidade,
  sino de notificacoes, tema e avatar. A navegacao sai dos pills do topo. O menu mobile
  continua como esta.
- **Fronteira:** `components/layout/` + `app/client-layout.tsx`
- **Entradas/Saidas:** mesma fonte `nav-config.ts`, mesma filtragem `FEATURE_ACCESS`
- **Cenario principal:**
  Given um usuario autenticado no desktop
  When ele abre qualquer rota `/dashboard*`
  Then a sidebar mostra os mesmos destinos que hoje aparecem no header, com o ativo em
  destaque, e o `<header>` segue no DOM com identidade + controles
- **Regras:**
  - R1: **nenhum destino novo** — os rotulos sao os de `nav-config.ts` (as referencias
    mostram `Times`/`Inventario`/`Gamificacao`, que nao existem: nao criar, DEC-112).
  - R2: `nav-config.ts` continua sendo a unica fonte; sidebar e menu mobile consomem a
    mesma estrutura (extraia o render do item e compartilhe).
  - R3: o `<header>` permanece no DOM (travado por `shell.spec.ts:31`).
  - R4: container de conteudo mantem `container mx-auto p-4 md:p-6` — nenhuma pagina e
    reposicionada por causa da largura.
  - R5: em telas estreitas vale o `Sheet` atual (`mobile-menu.tsx:52`).

### RF-V6.4 — Home (`/dashboard`)

- **Descricao:** regiao de cabecalho com saudacao, bloco de resumo compacto, coluna
  secundaria opcional, colunas do quadro com tinta chapada e icone de linha, e cartoes de
  tarefa com superficie chapada e badges por token.
- **Fronteira:** `app/(dashboard)/dashboard/page.tsx`, `features/tasks/components/*`
- **Cenario principal:**
  Given o quadro de tarefas aberto
  When o usuario olha a pagina
  Then o quadro segue sendo o elemento dominante e os novos blocos mostram **apenas**
  dado que a pagina ja carrega
- **Regras:**
  - R1: blocos de resumo limitados a dado ja em memoria: `overdueCount`,
    `isTaskDueToday`, `status === "done"`, `useProjects()`, `user.points`. **Sem**
    `Atividade recente`, **sem** `Status do sistema`, **sem** fetch de ranking
    (DEC-112).
  - R2: **sem coluna secundaria (DEC-114, dono 2026-10-07)** — o draft de referencia
    tem 4 colunas e o DisplayQuest mantem 5, entao o quadro reaproveita a largura
    horizontal toda para nao espremer as tasks. O resumo vai na regiao de cabecalho,
    ACIMA do quadro. `layout-patterns.md:133` (nao encher espaco vazio com widget) fica
    satisfeito porque nao ha coluna a encher.
  - R3: **5 colunas continuam 5** (`Ajustes` e estado de maquina do dominio) — as
    referencias mostram 4. E justamente por manter as 5 que a largura cheia e a escolha
    da DEC-114.
  - R4: os rotulos e estruturas travados do quadro (§2.7) **nao mudam**; emoji vira
    `lucide` e degradê vira tinta chapada sem tocar em `aria-label`, heading, botao ou
    toast.

### RF-V6.5 — Projetos (`/dashboard/projetos`)

- **Descricao:** um unico titulo de pagina, chips de status com contagem no lugar do
  `Select`, lista vertical de entradas ricas no lugar da grade de 2/3 colunas, progresso
  por entrada (dado ja carregado), coluna de visao geral a direita.
- **Fronteira:** `app/(dashboard)/dashboard/projetos/page.tsx`,
  `components/features/project-list.tsx`
- **Cenario principal:**
  Given a pagina de Projetos
  When o usuario filtra por status
  Then as entradas filtram e o chip mostra a contagem de cada status
- **Regras:**
  - R1: **um** titulo de pagina — o `h2 "Projetos"` (`project-list.tsx:88`) sai (D10).
  - R2: a entrada mostra so campos que existem: nome, status, descricao, `createdAt`,
    links, acoes + progresso derivado de `tasks`.
  - R3: **sem tags e sem avatares de membros na lista** (dado inexistente/N+1, §2.5,
    DEC-112).
  - R4: distribuicao por status, se existir, e barra empilhada de `div` — **sem**
    dependencia de grafico (DEC-112).
  - R5: os contextos legados `useProject` (`projetos/page.tsx:46`) e `useTask` **nao
    mudam de caminho** nesta onda (troca de data layer e refactor de comportamento,
    fora do escopo visual).
  - R6 (**DEC-186**): a visibilidade da aba **Dashboard** deixa de ser o gatilho inline
    `roles.includes("GERENTE_PROJETO")` (`projetos/page.tsx:98`) e passa a
    `hasAccess(roles, "DASHBOARD_PROJECT_MANAGER")` = `["COORDENADOR","GERENTE",
    "GERENTE_PROJETO"]`. E a **unica** mudanca de visibilidade deste plano: aditiva
    (ninguem perde a aba) e de apresentacao. O conteudo da aba **nao muda** —
    `ProjectManagerDashboard` segue filtrando por `leaderId === user?.id` (`:31`) e ja tem
    o estado vazio (`:190-197`). A aba **Voluntarios** segue intocada aqui (V6-9).

### RF-V6.6 — Projeto vira rota `/dashboard/projetos/[id]`

- **Descricao:** o `Dialog` de 90vh e substituido por uma rota de pagina; os dois pontos
  de entrada passam a navegar para ela; todo o conteudo e todas as portas de permissao
  sao preservados, e o empilhamento de 10 cards vira secoes separadas por respiro.
- **Fronteira:** `app/(dashboard)/dashboard/projetos/[id]/page.tsx` (novo),
  `components/ui/project-detail-dialog.tsx` (vai embora)
- **Entradas/Saidas:** `projectsApi.getById(id)` + `projectsApi.members(id)` (1 fetch,
  viavel so aqui); mesmo dado de `tasks`
- **Cenario principal:**
  Given um usuario autenticado
  When ele clica em ver um projeto
  Then a rota abre com o mesmo conteudo de hoje
- **Regras:**
  - R1: as **8 expressoes de porta** (tabela da §8.4; eram 7 contadas em 2026-10-07 — a 8a,
    `canManageProjectFiles`, ja existia e nao era contada) continuam com resultado
    identico. **Medir a porta do servidor antes** (DEC-92) antes de escrever o gate.
  - R2: **nenhum conteudo some** — todo bloco do dialog tem lugar na pagina (checklist
    em §8.4, reconstruido para os **14 paineis** medidos).
  - R3: `nav-config` ja tem `matchPrefix: true` para `/dashboard/projetos`
    (`nav-config.ts:45`) → "Projetos" segue ativo em `/dashboard/projetos/5`.
  - R4: `client-layout.tsx:19-34` (`DashboardProviders` — definicao `:19`, condicao
    `:21-24`, `ProjectProvider` `:28`, `TaskProvider` `:31`) ja cobre
    `pathname.startsWith("/dashboard/projetos")` → **nao mexer no provider**.
  - R5: `Editar` continua abrindo o `ProjectDialog` existente (modal), nao rota nova.
  - R6: `nav-config` nao ganha destino novo; breadcrumb e ilustracao decorativa estao
    fora (DEC-112).
  - R7: quirks **nao visuais** ficam intocados: mutacao `project.links = [...]`
    (`project-detail-dialog.tsx:122`) e `handleDeleteProject` no-op da pagina
    (`projetos/page.tsx:83`) — sao comportamento, nao visual.
  - R8: autenticacao vem do guard de grupo (`app/(dashboard)/layout.tsx:19-21`, que
    `redirect("/login")` sem sessao) — nenhuma checagem nova de auth.

### RF-V6.7 — Demais telas herdam os primitivos

- **Descricao:** Laboratorio, Relatorios Semanais, Perfil, Loja (+ Gerenciar), Ranking,
  Admin e Login/Register passam pelo mesmo roteiro: caracterizacao, `PageHeader`,
  tokens no lugar de paleta cravada/degradê, raio e padding na escala, reaproveitar os
  primitivos de RF-V6.2.
- **Fronteira:** `app/(dashboard)/dashboard/*`, `app/(auth)/*`, `components/admin/*`
- **Regras:**
  - R1: `ModernAdminPanel.tsx` (**1339 linhas**, **zero testes**, **8 abas**) tem
    caracterizacao **antes** de qualquer mudanca; hoje so `tsc` o cobre.
  - R2: nenhuma regra de negocio, guarda de permissao ou chamada de API muda.
  - R3: Login/Register ganham um `h1` (hoje tem **zero** `h1`/`h2`/`h3` no DOM).
  - R4: os **rotulos de navegacao que a redistribuicao muda** estao liberados de R4 de
    RF-V6.10: o rotulo de `/dashboard/weekly-reports` passa a **Relatorios**, o cabecalho
    `Painel Administrativo` permanece (2 testes o travam) e a **aba Voluntarios sai** da
    pagina de Projetos (RF-V6.12). Fora desses, nenhum texto visivel muda.
  - R5: esta secao **nao** inclui `/dashboard/loja/gerenciar` (removida, RF-V6.15), nem
    `/dashboard/admin` alem do que RF-V6.14 define (guarda de servidor, corte da aba
    `settings`, motivo por aba), nem `/dashboard/projetos` (RF-V6.5) e `/dashboard`
    (RF-V6.4), que tem RF propria.

### RF-V6.8 — Tema escuro e variante de primeira classe

- **Descricao:** toda regra escrita para superficie clara tem contraparte dark; a skill
  passa a documentar as duas variantes apoiada nos tokens que ja existem (§2.6).
- **Fronteira:** `.opencode/skills/displayquest-ui/**`, telas do escopo
- **Cenario principal:**
  Given qualquer tela do escopo
  When o tema e alternado
  Then a hierarquia de superficies, a borda e os badges continuam legiveis usando os
  tokens `.dark`, sem regressao
- **Regras:**
  - R1: paleta re-autorizada; **`filter: invert`, `#000`/`#fff` puro, glow e neon sao
    proibidos**.
  - R2: badges continuam **fill translucido + texto da mesma cor** (nao outline).
  - R3: colunas do quadro mantem o matiz semantico como **tinta escura de baixa
    luminancia** — nunca pastel claro levado para o dark.
  - R4: nenhuma alteracao nos valores do bloco `.dark` (`app/globals.css:55-99`) sem
    DEC (eles ja casam com a referencia).

### RF-V6.9 — Skill e ferramentas alinhadas

- **Descricao:** a skill e os agentes/comandos passam a descrever as 5 referencias, o
  tema escuro e a ausencia de ilustracao, e o comando de refactor passa a nomear o gate
  real do repo.
- **Fronteira:** `.opencode/skills/displayquest-ui/SKILL.md`,
  `.opencode/skills/displayquest-ui/references/*.md`,
  `.opencode/agents/ui-reviewer.md`, `.opencode/commands/ui-refactor.md`
- **Regras:**
  - R1: `SKILL.md` lista as **5**: `home.png`, `projects.png`, `project.png`,
    `reports.png` e `home-darkmode.png` (este ultimo como autoridade do dark).
  - R2: **nenhuma secao remanescente manda usar ilustracao ou texto manuscrito**
    (`visual-language.md:16-17,30,35,48,54`, `anti-patterns.md:54`,
    `layout-patterns.md:135`, `design-system.md:93`, `components.md:36`).
  - R3: `ui-reviewer.md:31` deixa de exigir ilustracao e passa a verificar a **ausencia**
    de artwork decorativo.
  - R4: `ui-refactor.md:33` nomeia o gate concreto (`arch:check` + `lint` + `tsc --noEmit` +
    `vitest run`) em vez de "the relevant checks".
  - R5: os arquivos de skill/agent/command **nao sao** codigo, e o `.gitignore:7` ignora
    `.opencode/**` inteiro: as mudancas nao alteram gate tecnico e **nao geram commit**.
    A prova da onda e o `git diff` local e o grep de AC-V6-23.

### RF-V6.10 — Invariantes de comportamento

- **Descricao:** nada alem de apresentacao muda.
- **Fronteira:** todas
- **Regras:**
  - R1: **zero** mudanca em `prisma/`, `backend/`, `app/api/`, `lib/auth/`,
    `lib/api/endpoints/`, `contexts/` (data layer), `features/*/hooks/`,
    `features/*/utils/`.
  - R2: **zero** dependencia nova em `package.json`.
  - R3: **zero** rota nova alem de `/dashboard/projetos/[id]`; **zero** endpoint novo.
  - R4: nenhum rotulo visivel, toast, `aria-label` ou `testid` muda de texto — **exceto**
    os tres que a redistribuicao decidiu (RF-V6.7 R4): o rotulo do destino de Relatorios, a
    remocao da aba Voluntarios de Projetos e a criacao da mesma aba no Painel
    Administrativo. Fora desses, o texto congelado por teste permanece.
  - R5: comportamento de tema (default light, `enableSystem`) nao muda.

### RF-V6.11 — Relatorios: destino unico, tres abas e um assistente (DEC-181)

- **Descricao:** a pagina de relatorios passa a ser **um** destino com **tres abas** — por
  usuario (semanal), por projeto (relatorio tecnico) e **atestados** — mais um
  **assistente de 3 passos** que reune os tres fluxos de geracao que hoje vivem separados.
- **Fronteira:** `app/(dashboard)/dashboard/weekly-reports/page.tsx`,
  `components/layout/nav-config.ts` (rotulo), os paineis que hoje moram no dialog do
  projeto (`project-technical-reports-panel`, `project-certificates-panel`),
  `components/features/project-reports-panel.tsx`
- **Cenario principal:**
  Given um usuario com `VIEW_WEEKLY_REPORTS`
  When ele abre Relatorios
  Then ve as tres abas e o assistente, sem perder acesso a nenhum relatorio que ja existia
- **Regras:**
  - R1: o que a DEC-181 unifica e o **fluxo de geracao** (3 caminhos viram 1 assistente),
    nao o inventario: **nenhum bloco some** do detalhe do projeto (RF-V6.13 R3) e os dois
    pontos ficam ligados por **atalho**.
  - R2: a aba **Templates fica fora** — o produto nao tem fonte de template para uma tela
    propria (DEC-112); os templates oficiais sao asset de leitura do backend (DEC-128/130).
  - R3: o `h1` e o rotulo do nav passam a **Relatorios**; a **rota** fica como esta —
    `/dashboard/weekly-reports` (DEC-185).
  - R4: os gates por aba **preservam o resultado medido**: a aba de usuario segue
    `VIEW_WEEKLY_REPORTS`, a geracao em lote segue `MANAGE_USERS`, e as abas de projeto e
    atestado seguem a autorizacao que o plan-v5 ja colocou nos use cases (lider OU gestao
    do projeto / self OU gestao).
  - R5: a geracao continua chamando as **mesmas** rotas de API; nenhum endpoint novo.
  - R6: "relatorio tecnico" mantem o vocabulario do plan-v5
    (`parcial|tecnico-final|final`) — nao ha segundo vocabulario (licao DEC-95/96).

### RF-V6.12 — Voluntarios passa para o Painel Administrativo (DEC-182)

- **Descricao:** a aba **Voluntarios** sai da pagina de Projetos e vira **aba do Painel
  Administrativo**.
- **Fronteira:** `app/(dashboard)/dashboard/projetos/page.tsx`,
  `components/features/volunteers-management.tsx` (movido),
  `components/admin/ModernAdminPanel.tsx`
- **Regras:**
  - R1: `volunteers-management.tsx` (**479 linhas**) e **movido**, nao reescrito: mesma
    tabela, mesmas colunas, mesmos dados.
  - R2: quem ve e o conjunto **medido** (`showVolunteers` = `COORDENADOR`, `GERENTE`,
    `GERENTE_PROJETO`), agora na chave `DASHBOARD_VOLUNTEERS`. O administrativo fica
    acessivel por `DASHBOARD_ADMIN ∪ DASHBOARD_VOLUNTEERS`, com gate **por aba**.
  - R3: os rotulos seguem o vocabulario real (`pending|active|rejected|suspended`) — o
    filtro morto **nao** volta (DEC-96).
  - R4: a pagina de Projetos perde a aba, o estado e o calculo; a Lista passa a ser o
    conteudo unico.
  - R5: quem tinha `VIEW_PROJECT_DASHBOARD` sem nenhuma das duas chaves continua vendo a
    Lista, como hoje.

### RF-V6.13 — Detalhe do projeto em 5 abas (DEC-183)

- **Descricao:** a rota do projeto organiza os **14 paineis** nas **5 abas da referencia**.
- **Fronteira:** `app/(dashboard)/dashboard/projetos/[id]/page.tsx`,
  `components/features/project-*.tsx`
- **Regras:**
  - R1: a distribuicao decidida — o que era **uma coluna de 621 linhas** vira 5 abas:

    | Aba | Blocos |
    |---|---|
    | **Visao geral** | descricao · dados do projeto (periodo, edital, processo, PROPPI, pontos, `ProjectTimeProgress`) · informacoes do projeto |
    | **Tarefas** | `ProjectCronogramaPanel` · 4 stat cards · progresso · lista de tarefas |
    | **Membros** | `ProjectHoursStats` · `ProjectMembersManagement` |
    | **Arquivos** | `ProjectDeliverablesPanel` · `ProjectAttachmentsPanel` · `ProjectTechnicalReportsPanel` · `ProjectCertificatesPanel` · `ProjectReportsPanel` |
    | **Configuracoes** | links do projeto · `ProjectLeaderLogs` |

  - R2: `Editar`/`Excluir` ficam no **cabecalho** da rota (nao numa aba), com o mesmo gate
    `EDIT_PROJECT`.
  - R3: **nenhum bloco some** — o checklist de §8.4 e o contrato, e cada bloco declara a
    aba onde aparece.
  - R4: o **rail direito** (Informacoes, Membros, Atividade) so mostra o que a pagina ja
    carrega; `Atividade` **nao** inventa feed (nao existe API — §2.5).
  - R5: a distribuicao e decisao registrada **para nao ser relitigada**; sem nova DEC, so
    muda posicao dentro da mesma aba.

### RF-V6.14 — Painel Administrativo: guarda, corte e motivo por aba (DEC-184)

- **Descricao:** a tela mais sensivel ganha guarda de servidor, perde a aba placeholder e
  passa a dizer o motivo quando uma aba nao esta disponivel.
- **Fronteira:** `app/(dashboard)/dashboard/admin/` (novo `layout.tsx`),
  `components/admin/ModernAdminPanel.tsx`
- **Regras:**
  - R1: a aba `settings` (`ModernAdminPanel.tsx:994`, placeholder) **sai**; nenhuma outra
    aba some.
  - R2: cada aba restante declara a **chave que a governa**, e aba sem permissao renderiza
    **o motivo**, nao conteudo vazio.
  - R3: a guarda de entrada e do **servidor** (RF-V6.16, S3) com `DASHBOARD_ADMIN`; a frase
    de negacao preserva a atual — **2 testes** travam o heading `"Painel Administrativo"`
    do caso autorizado.
  - R4: `ModernAdminPanel.tsx` (**1339 linhas**, **zero testes**) recebe **caracterizacao
    antes** de qualquer mudanca.

### RF-V6.15 — A rota morta `/dashboard/loja/gerenciar` sai

- **Descricao:** remove-se a rota sem nenhuma referencia de entrada (§2.9-B).
- **Fronteira:** `app/(dashboard)/dashboard/loja/gerenciar/`
- **Regras:**
  - R1: **zero** inbound hoje — a remocao nao quebra navegacao (medido, §2.9-B).
  - R2: o que ela oferecia ja existe na aba **Gerenciar** de `/dashboard/loja` (`:255+`),
    inclusive o CRUD de recompensa; **nada e portado**.
  - R3: o `layout.tsx` de `/dashboard/loja` continua servindo a rota viva.
  - R4: as 3 abas da rota morta (Recompensas/Pendentes/Historico) **nao** viram abas da
    loja: ela ja tem 4 e a fila de aprovacoes ja e uma delas.

### RF-V6.16 — Autorizacao: uma decisao por vez, no lugar certo

- **Descricao:** encerra as reimplementacoes locais de papel e garante que a decisao que
  **pode negar** acontece no servidor.
- **Cenario principal:**
  Given uma rota do escopo
  When um ator sem a permissao correspondente a acessa
  Then a negacao vem do servidor (a pagina nao renderiza o conteudo protegido)
- **Regras:**
  - S1: a guarda de entrada mora no servidor (§2.4, S1); o cliente **esconde**, nao decide.
  - S2: dado restrito continua saindo so pela API.
  - S3: `/dashboard/admin` e o caso a corrigir; a frase de negacao existente e preservada
    e os testes que a fixam continuam verdes.
  - R1: **nenhum conjunto de papeis muda de valor** — chave nova nasce com o valor medido —
    **com uma excecao registrada**: `DASHBOARD_PROJECT_MANAGER`, cujo valor foi decidido
    pelo dono (DEC-186) como a uniao `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`.
  - R2: gatilho local vira chave nomeada: `DASHBOARD_VOLUNTEERS` =
    `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (o `showVolunteers` medido) e
    `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (o
    `showDashboard` **corrigido** pela DEC-186, e nao o valor medido, que era
    `["GERENTE_PROJETO"]`). Os dois valores coincidem hoje, mas governam **recursos
    diferentes** (aba do Admin x aba de Projetos): sao chaves separadas de proposito, e
    nenhuma delas e copia da outra.
  - R3: a reimplementacao de `DASHBOARD_ADMIN` em `admin/page.tsx:52` passa a usar a chave.
  - R4: chave duplicada ou morta e resolvida: `MANAGE_REWARDS` fica em **uma** matriz,
    `DASHBOARD_PROJETOS` (0 consumidores) sai, e a pagina e o nav da mesma tela passam a
    falar **a mesma chave**.
  - R5: o cliente passa a pedir o que o servidor ja permite (caso C da §2.9): a fonte e a
    **chave**, nao uma lista escrita a mao.
  - R6: **caracterizacao antes** em toda tela sem cobertura (§2.7).

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Portabilidade visual | Tela coerente em 320/768/1024/1440 px | `/ui-review` + inspecao; `responsive behavior` do `ui-reviewer` |
| A11y | Hierarquia de heading e rotulos acessiveis preservados | `getByRole("heading")`/`getByLabel` da suíte existente verdes |
| Regressao | Nenhum teste existente quebra | `npx vitest run` zero failure, `>= 157/2134` (baseline §2.8) |
| **Seguranca** | **Nenhuma rota do escopo decide acesso so no cliente**; dado restrito sai so pela API | guarda de servidor em `/dashboard/admin` (RF-V6.14/RF-V6.16) + teste de negacao por papel |
| Arquitetura | Gate de dependencias segue verde | `npm run arch:check` exit 0, allow-list vazia |
| Documentacao | Guia do usuario continua representando a tela | G5 `docs:build` + `docs:check`; G6 recapturacao |
| Performace | Nenhum N+1 novo; nenhuma lista extra por item | revisao de `fetch` na onda V6-5 (unico fetch de membros, por rota) |
| Reversibilidade | Cada onda e um commit revertivel | `git log` com 1 commit por onda |

## 6. Modelo de dados (se aplicavel)

**NENHUM.** Nenhuma migration, nenhuma coluna, nenhum model novo. Uma alteracao de
`prisma/schema.prisma` neste plano e automaticamente um erro de escopo.

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados

**NENHUM.** Nenhum `app/api/**` e tocado.

### 7.2 Eventos de dominio publicados/consumidos

**NENHUM.**

### 7.3 Rotas de pagina novas/removidas

| Rota | Arquivo | Auth | Observacao |
|---|---|---|---|
| `GET /dashboard/projetos/[id]` | `app/(dashboard)/dashboard/projetos/[id]/page.tsx` | guard de sessao do grupo (`app/(dashboard)/layout.tsx:19-21`) | substitui o `ProjectDetailDialog`; **unica rota nova do plano** |
| ~~`GET /dashboard/loja/gerenciar`~~ | `app/(dashboard)/dashboard/loja/gerenciar/` | — | **removida** (RF-V6.15): 422 linhas, **zero** inbound medido (§2.9-B) |
| `/dashboard/admin` | ganha `app/(dashboard)/dashboard/admin/layout.tsx` | `DASHBOARD_ADMIN` no **servidor** | fechar o buraco §2.9-A sem mover a pagina para RSC (RF-V6.14/RF-V6.16) |

O `nav-config.ts` **nao ganha destino novo**: a redistribuicao move o rotulo de Relatorios e
as abas de Voluntarios/Admin, e remove a rota morta — nenhum item de menu e criado.

## 8. Casos de teste / evidencia esperada

### 8.1 Testes novos previstos (escrito ANTES da mudanca nas ondas sem cobertura)

| Arquivo | Cobre |
|---|---|
| `tests/unit/ui/page-header.test.tsx` | RF-V6.2 — um `<h1>`, acoes, descricao quieta |
| `tests/unit/ui/stat-card.test.tsx` | RF-V6.2 |
| `tests/unit/ui/empty-state.test.tsx` | RF-V6.2 |
| `tests/unit/ui/search-input.test.tsx` | RF-V6.2 |
| `tests/unit/ui/status-badges.test.tsx` | RF-V6.1/RF-V6.2 — um mapa so, sem gradiente, variantes dark |
| `tests/unit/layout/app-sidebar.test.tsx` | RF-V6.3 — itens vem de `nav-config`, ativo destacado, sem destino novo |
| `features/projects/__tests__/project-list.test.tsx` | RF-V6.5 — **caracterizacao antes** da grade→lista |
| `features/projects/__tests__/project-detail-page.test.tsx` | RF-V6.6 — as **8** portas, por papel |
| `tests/unit/domain/identity/permission-keys.test.ts` | RF-V6.16 R1/R4 — chaves mortas/duplicadas fora; valores medidos preservados (`DASHBOARD_VOLUNTEERS`) |
| `tests/unit/app/admin-guard.test.tsx` | RF-V6.14/RF-V6.16 S3 — negacao vem do servidor; frase preservada |
| `tests/unit/components/admin/admin-tabs.test.tsx` | RF-V6.14 R1/R2 — `settings` fora; aba sem permissao **diz o motivo** |
| `tests/unit/components/admin/volunteers-tab.test.tsx` | RF-V6.12 — a aba existe no admin e nao em Projetos |
| `tests/unit/store/purchase-scope-alignment.test.ts` | RF-V6.16 R5 — o cliente pede o que o servidor permite (caso C da §2.9) |

### 8.2 Gates

```
npm run arch:check          # G0 — exit 0, allow-list vazia (baseline 1026/4383)
npm run lint                # G1 — nenhum erro
npx tsc --noEmit            # G2 — NAO PIORAR: 1 erro pre-existente hoje (§2.8); V6-0 decide
npx vitest run              # G3 — zero failure (baseline 157/2134 -> nunca menor)
npm run docs:build && npm run docs:check   # G5 — obrigatorio nas ondas visiveis
# e2e (requer dev server em :3001):
npx playwright test tests/e2e/shell.spec.ts        # 5 passando
npx playwright test tests/e2e/task-board.spec.ts   # 2 passando + 1 falha conhecida + 5 did not run
```

**G2 e a primeira coisa a resolver (V6-0).** O `tsc` **nao** fecha em 0 nesta branch por um
erro pre-existente (`features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105`,
conferido com `git stash`). Nenhuma onda pode exigir "0 erros" antes de o V6-0 decidir entre
**consertar** o teste ou **registrar** o erro como divida conhecida — o criterio da onda e
**nao piorar**.

### 8.3 Contagem esperada ao final

- `tests/unit` + `features`: **nunca menor que 157 arquivos / 2134 testes** (baseline §2.8);
  os **13 arquivos** de §8.1 somam, e **nada e removido** — a rota morta de RF-V6.15 nao tem
  teste.
- suíte completa: **nunca menor que 172 / 2264**
- e2e: mesma faixa de hoje (**nao piora**) — a falha conhecida do 3o teste e dado da
  instancia, nao codigo (confirmar com `git stash` se mudar)

### 8.4 Checklist de conteudo da rota do projeto (contrato do AC-V6-19)

Os **14 paineis** de §2.4.3 desdobrados em blocos. Os `arquivo:linha` da versao anterior
deste checklist **morreram**: foram medidos num arquivo de **478 linhas** e o arquivo hoje
tem **621** — a reme-diacao do inventario por linha e passo da onda V6-6, nao deste spec
(lição: numero de linha de arquivo que cresce nao e contrato).

Toda linha abaixo tem de existir em `/dashboard/projetos/[id]`:

| # | Bloco | Porta | Aba (RF-V6.13) |
|---|---|---|---|
| 1 | Capa/logo do projeto (`ProjectMediaHeader`) | `canManageProjectFiles` | Visao geral |
| 2 | Nome + badge de status + "Criado em {data}" | — | Visao geral |
| 3 | Botoes **Editar** / **Excluir** (cabecalho) | `EDIT_PROJECT` | cabecalho |
| 4 | Descricao do projeto (se houver) | — | Visao geral |
| 5 | Dados do projeto (periodo, edital, processo, PROPPI, pontos) + `ProjectTimeProgress` | — | Visao geral |
| 6 | **Informacoes do Projeto** (Detalhes + Resumo) | — | Visao geral |
| 7 | 4 stat cards (Total / Concluidas / Em Progresso / Pendentes) + **Progresso Geral** | — | Tarefas |
| 8 | `ProjectCronogramaPanel` | `canManageProjectFiles` p/ escrita | Tarefas |
| 9 | Lista de tarefas + **Importar Backlog** + **Criar Tarefa** | `CREATE_TASK` | Tarefas |
| 10 | Estado vazio da lista + **Criar Primeira Tarefa** | `CREATE_TASK` | Tarefas |
| 11 | `ProjectHoursStats` | — | Membros |
| 12 | **Membros do Projeto** (gestao) | `MANAGE_PROJECT_MEMBERS` **ou** `COORDENADOR` **ou** `GERENTE` | Membros |
| 13 | `ProjectDeliverablesPanel` | `canManageProjectFiles` p/ escrita | Arquivos |
| 14 | `ProjectAttachmentsPanel` | `canManageProjectFiles` p/ escrita | Arquivos |
| 15 | `ProjectTechnicalReportsPanel` | `canManageProjectFiles` p/ escrita | Arquivos |
| 16 | `ProjectCertificatesPanel` | `canManageProjectFiles` p/ gerar (self ou gestao no servidor) | Arquivos |
| 17 | `ProjectReportsPanel` (relatorios semanais do projeto) | `leaderId` **ou** `MANAGE_USERS` | Arquivos |
| 18 | **Links** + form **Adicionar Link** | `EDIT_PROJECT` no form | Configuracoes |
| 19 | `ProjectLeaderLogs` (Logs do Projeto) | `leaderId === user.id` | Configuracoes |
| 20 | Dialogos internos: `TaskDialog`, `BacklogDialog` | herdados | — |

**As 8 expressoes de porta** (contrato de AC-V6-18), sem repetir expressao:

| # | Expressao (medida em `project-detail-dialog.tsx`) | Cobre |
|---|---|---|
| 1 | `hasAccess(user.roles, "EDIT_PROJECT")` — botoes (`:200`) | Editar/Excluir |
| 2 | `hasAccess(user.roles, "CREATE_TASK")` — cabecalho de Tarefas (`:397`) | Importar Backlog/Criar Tarefa |
| 3 | `hasAccess(user.roles, "CREATE_TASK")` — estado vazio (`:419`) | Criar Primeira Tarefa |
| 4 | `hasAccess(user?.roles \|\| [], "EDIT_PROJECT")` — form de Links (`:532`) | Adicionar Link |
| 5 | `project.leaderId === user.id` (`:584`) | `ProjectLeaderLogs` |
| 6 | `leaderId === user.id \|\| hasAccess(user.roles, "MANAGE_USERS")` (`:589`) | `ProjectReportsPanel` |
| 7 | `MANAGE_PROJECT_MEMBERS` **ou** `COORDENADOR` **ou** `GERENTE` (`:595`) | `ProjectMembersManagement` |
| 8 | `canManageProjectFiles` (`:165-171`) = `leaderId` **ou** `MANAGE_USERS` **ou** `MANAGE_PROJECTS` **ou** um de `COORDENADOR`/`GERENTE`/`GERENTE_PROJETO` | **6 blocos**: midia, entregaveis, anexos, cronograma, relatorios tecnicos, atestados |

Cada uma **preserva o resultado identico**, medido por papel. A expressao 8 e a mais larga e
a que a versao anterior deste spec **nao contava** — ela sozinha governa 6 dos 20 blocos.

## 9. Acceptance criteria (definitivos e rastreaveis)

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-V6-01 | Given as telas do escopo, When grepo por `bg\|text\|border\|from\|to-<paleta>-<n>`, Then **0** ocurrencias (excecoes so via DEC) | grep com os caminhos da onda (baseline hoje: **928**) | RF-V6.1 |
| AC-V6-02 | Given as telas do escopo, When grepo `gradient`, Then **0** (baseline hoje: **39**) | grep | RF-V6.1 |
| AC-V6-03 | Given a escala de raio, When grepo `rounded` solo e `rounded-2xl` no escopo, Then **0** (hoje: 21 e 4) | grep | RF-V6.1 |
| AC-V6-04 | Given cada pagina do escopo, When conto `<h1>`, Then **exatamente 1** por pagina | grep `<h1` por pagina | RF-V6.2 |
| AC-V6-05 | Given o padrao de stat card, When grepo `items-center justify-between space-y-0 pb-2`, Then a unica ocorrencia e dentro do primitivo novo (hoje: **6 arquivos**) | grep | RF-V6.2 |
| AC-V6-06 | Given status→cor, When grepo `statusColors\|statusLabels\|taskStatusColors\|statusBadgeClass\|priorityBadgeClass`, Then **0** (existe so `components/ui/status.ts`) | grep + `tests/unit/ui/status-badges.test.tsx` | RF-V6.2 |
| AC-V6-07 | Given um componente novo, When uso `PageHeader`/`StatCard`/`EmptyState`/`SearchInput` numa tela, Then ela nao reimplementa o padrao | revisao + teste do primitivo | RF-V6.2 |
| AC-V6-08 | Given o desktop, When abro qualquer `/dashboard*`, Then ha sidebar com os itens de `nav-config` e o `<header>` continua visivel | `tests/e2e/shell.spec.ts:31` verde + `app-sidebar.test.tsx` | RF-V6.3 |
| AC-V6-09 | Given a navegacao, When grepo `rounded-full` nos itens de nav, Then **0** | grep em `components/layout/*` | RF-V6.3 |
| AC-V6-10 | Given a viewport estreita, When abro o menu, Then o `Sheet` atual segue funcionando | `mobile-menu.tsx:52` inalterado + teste visual | RF-V6.3 |
| AC-V6-11 | Given a Home, When olho a pagina, Then ha regiao de cabecalho com saudacao e blocos de resumo **apenas** com dado ja carregado (R1 de RF-V6.4), **sem coluna secundaria** — o quadro ocupa a largura toda (DEC-114) | teste do componente + revisao `/ui-review home` | RF-V6.4 |
| AC-V6-12 | Given o quadro, When grepo `gradient` e emoji em `board-column`/`task-card`, Then **0**, **e** `aria-label="Coluna X"` (`task-board.spec.ts:67`), o `<h2>` exato (`:396`) e "Ordenar tarefas de X" (`:477`) continuam presentes | `features/tasks/__tests__/*` verdes | RF-V6.4 |
| AC-V6-13 | Given a Home mudada, When rodo a suíte do quadro, Then zero failure e o e2e nao piora | `npx vitest run features/tasks` + `playwright test tests/e2e/task-board.spec.ts` | RF-V6.4 |
| AC-V6-14 | Given Projetos, When conto os titulos da pagina, Then **1** (`h2 "Projetos"` de `project-list.tsx:88` removido) | grep `<h1\|<h2` em `dashboard/projetos` + `project-list.tsx` | RF-V6.5 |
| AC-V6-15 | Given Projetos, When olho os filtros, Then ha chips de status com contacao de cada status, e as entradas estao numa lista vertical | `project-list.test.tsx` + `/ui-review projetos` | RF-V6.5 |
| AC-V6-16 | Given que Projetos nao tem teste, When inicio a onda, Then os testes de caracterizacao estao **escritos e verdes antes** da primeira mudanca de layout | `git log` mostra o teste num commit anterior ao da UI; `project-list.test.tsx` verde | RF-V6.5 |
| AC-V6-17 | Given `/dashboard/projetos/[id]` autenticado, When acesso, Then renderiza o conteudo; sem sessao, Then redirect para `/login` | `app/(dashboard)/layout.tsx:19-21` + teste de rota/componente | RF-V6.6 |
| AC-V6-18 | Given as **8 expressoes de porta** da §2.4.3, When renderizo para cada papel, Then o resultado e **identico** ao de hoje | `project-detail-page.test.tsx` (casos por papel) | RF-V6.6 |
| AC-V6-19 | Given o checklist da §8.4, When comparo com a pagina, Then **nenhuma secao falta** | §8.4 mapeado em teste de presenca | RF-V6.6 |
| AC-V6-20 | Given cada tela restante, When olho, Then tem `PageHeader`, sem paleta cravada e sem degradê | grep por onda + `/ui-review <tela>` | RF-V6.7 |
| AC-V6-21 | Given `ModernAdminPanel`, When inicio a onda, Then a caracterizacao existe e esta verde antes | `tests/unit/components/admin/*.test.tsx` verde antes do commit de UI | RF-V6.7 |
| AC-V6-22 | Given tema escuro, When renderizo as telas do escopo, Then nenhuma usa `#000`/`#fff` puro e a hierarquia usa os tokens `.dark` | grep + revisao `/ui-review <tela> --dark` | RF-V6.8 |
| AC-V6-23 | Given a skill, When grepo `illustrat\|hand-drawn\|handwritten` nos `.md`, Then **0 mandando usar**; `SKILL.md` cita as **5** imagens (hoje cita 2); `ui-reviewer.md` nao tem a prioridade 9 de ilustracao | grep em `.opencode/skills` + `.opencode/agents` | RF-V6.9 |
| AC-V6-24 | Given a suíte inteira, When rodo `npx vitest run`, Then **zero failure** e **nunca menor que 157/2134** | gate G3 | RF-V6.10 |
| AC-V6-25 | Given o plano terminado, When comparo `package.json`, Then **nenhuma dependencia nova** | `git diff package.json` vazio | RF-V6.10 |
| AC-V6-26 | Given telas visiveis mudadas, When rodo G5, Then `docs:build` e `docs:check` verdes e as capturas de `docs/screens/` foram recapturadas (G6) | `npm run docs:build && npm run docs:check` + `git diff docs/screens` | §5 |
| AC-V6-27 | Given os relatorios, When abro a pagina, Then ha **3 abas** (usuario / projeto / atestados) e o assistente de 3 passos; **nao** ha aba Templates | revisao + `/ui-review relatorios` | RF-V6.11 |
| AC-V6-28 | Given um relatorio de projeto existente, When comparo antes/depois da redistribuicao, Then ele continua alcancavel pelos **dois** pontos (Relatorios e a aba Arquivos do projeto) | teste de navegacao + §8.4 linha 15 | RF-V6.11 |
| AC-V6-29 | Given a pagina de Projetos, When conto as abas, Then **nao ha** aba Voluntarios; Given o Painel Administrativo, Then a aba Voluntarios **existe** | `volunteers-tab.test.tsx` + grep | RF-V6.12 |
| AC-V6-30 | Given os papeis `COORDENADOR`, `GERENTE`, `GERENTE_PROJETO`, When abro o Painel, Then os tres veem a aba Voluntarios e **nenhum outro** papel ve; Given `COORDENADOR`, `GERENTE` e `GERENTE_PROJETO` na pagina de Projetos, Then os tres veem a aba Dashboard (DEC-186) e **nenhum outro** papel ve | teste por papel | RF-V6.12/RF-V6.16 |
| AC-V6-31 | Given a rota do projeto, When conto as abas, Then sao **5**; When comparo com a §8.4, Then **nenhum dos 20 blocos falta** e cada um esta na aba declarada | teste de presenca + `/ui-review projeto` | RF-V6.13 |
| AC-V6-32 | Given `/dashboard/admin` sem a permissao, When acesso, Then a decisao e do **servidor** (nao renderiza o painel) e a frase de negacao e a mesma; Given a permissao, Then vejo as abas restantes e **nao** a `settings`, e aba sem chave **diz o motivo** | `admin-guard.test.tsx` + `admin-tabs.test.tsx` | RF-V6.14 |
| AC-V6-33 | Given o repo, When grepo `loja/gerenciar`, Then **0** ocorrencias e a rota **nao existe** | grep + `ls` | RF-V6.15 |
| AC-V6-34 | Given o repo, When grepo `DASHBOARD_PROJETOS` (chave morta) e `MANAGE_REWARDS` nas matrizes, Then **0** ocorrencia da primeira (removida) e **1** da segunda; When leio `DASHBOARD_VOLUNTEERS`, Then e `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`; When leio `DASHBOARD_PROJECT_MANAGER`, Then e `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (DEC-186) | `permission-keys.test.ts` | RF-V6.16 |
| AC-V6-35 | Given um `GERENTE`, When abre a fila de Aprovacoes da loja, Then recebe **todas** as compras que o servidor autoriza (nao mais so as proprias) | `purchase-scope-alignment.test.ts` | RF-V6.16 R5 |
| AC-V6-36 | Given as telas que adotam `PageHeader`, When leio `document.title`, Then cada uma tem o **titulo proprio** (`<titulo> · DisplayQuest`), e as rotas sem `PageHeader` (o intersticial `/`) usam o fallback de `app/layout.tsx`; When grepo `Sistema de Gerenciamento de Tarefas`, Then **0** ocorrencias no `app/` | `page-header.test.tsx` + grep | RF-V6.2 R5 |
| AC-V6-37 | Given o Painel Administrativo acessado por um `COORDENADOR`, When procuro a aba Voluntarios, Then ela **existe** (nao perdeu nada); Given a pagina de Projetos acessada por `COORDENADOR`/`GERENTE`, When renderiza, Then a aba Dashboard **existe** e a de Voluntarios **nao** | teste por papel | RF-V6.12/RF-V6.16 (DEC-182/DEC-186) |

## 10. Fora de escopo (desta versao)

- **Funcionalidade nova**: tags de projeto, feed de "Atividade recente", busca global
  Cmd/Ctrl+K, destino de navegacao novo (`Times`, `Inventario`, `Gamificacao`), grafico
  com dependencia nova, datas de inicio/fim de projeto, avatares de membros na lista.
- **Ilustracoes e texto manuscrito** — decidido fora (DEC-109); a Fase "identidade
  ilustrada" do plano anterior foi **removida**.
- **Dark mode novo**: nao se mexe nos valores do bloco `.dark` (ja casam com a
  referencia); so se documenta e se consome.
- **Mudanca de regra/permissao**: nenhuma guarda, nenhum enum, nenhum `hasAccess` —
  **com as excecoes registradas**: RF-V6.16 fecha os buracos de autorizacao da §2.9
  (guarda de servidor no admin, chaves mortas/duplicadas, alinhamento do cliente ao
  servidor) e **um** conjunto de papeis muda de valor por decisao do dono — o da aba
  Dashboard de Projetos, que passa a incluir COORDENADOR e GERENTE (DEC-186). Fora dele,
  nenhum conjunto muda.
- **Redistribuicao que NAO acontece**: nao se cria destino de navegacao novo, nao se move
  o Quadro de Tarefas e nao se migra o data layer. O quirk do `showDashboard` **sai** por
  decisao do dono (DEC-186) — e a unica ampliacao de visibilidade do plano, e ela e
  apresentacao (aba visivel), nao dado: quem passa a ver a aba ja podia ler os mesmos
  projetos e tarefas pela leitura aberta do plan-v5 (DEC-136).
- **Renome da rota de Relatorios**: o diretorio continua `/dashboard/weekly-reports` —
  so o `h1` e o rotulo do nav mudam (DEC-185).
- **Titulo por rota por `layout.tsx` de segmento**: fica fora — o titulo passa a ser
  escrito por efeito no cliente, dentro do `PageHeader` (DEC-188), sem RSC.
- **Nomes de terceiros em telas de gestao** (fila de aprovacao de compras, lista de
  usuarios do admin): ficam **fora** deste plano (DEC-187) — sao telas de administracao,
  em que identificar o titular do registro e o proposito da tela; o plano nao amplia
  visibilidade nenhuma e o **CPF** continua restrito ao self/`MANAGE_USERS` (DEC-138).
- **Data layer**: trocar os contextos legados de Projetos pelo TanStack `useProjects`
  e refactor de comportamento — fila separada.
- **Backend**: `prisma/`, `backend/`, `app/api/` intocados.
- **Testes e2e novos obrigatorios**: a caracterizacao e unitaria (mais estavel e na casa);
  e2e so e exigido como gate de nao-regressao.

## 11. Dependencias e bloqueadores

| Item | Tipo | Estado |
|---|---|---|
| plan-v5 | pre-condicao | **CUMPRIDA — encerrado em 2026-10-14** (`cd2d24f V5-close`, 35 batches, DEC-61..77/99..104/126..179). A DEC-145 (plan-v6 so depois do plan-v5 fechar) esta satisfeita, e a DEC-113 (o backend e a fonte de verdade; nas colisoes o plan-v5 executa antes) **deixou de ser colisao**: nao ha mais execucao concorrente |
| plan-v4 `done` (2026-10-07) | pre-condicao | cumprido |
| Dev server em `:3001` | infra p/ e2e | necessario so nas ondas com e2e |
| Leitura das referencias por modelo com visao | processo | **DEC-105**: `strata` e `muse` leem; `big-pickle` e `nemotron` nao. Inventario gravado em §2.3/§2.6; o modelo local com visao confere (dono, 2026-10-14) |
| Dado legitimo da instancia no quadro | ruido conhecido | 3o teste do e2e ja falha; confirmar com `git stash` |
| Aprovacao visual do dono por onda | processo | gate de aceite de cada onda |

## 12. Perguntas abertas (ASK)

**Nenhuma aberta.** As quatro perguntas deste plano foram respondidas pelo dono em
2026-10-14, na mesma rodada da revisao, e viraram decisao (DEC-185..188). A tabela fica
como registro do que foi perguntado e decidido: o plano **nao executa onda com ASK aberta**.

| ID | Pergunta | Resposta do dono (2026-10-14) | Decisao |
|---|---|---|---|
| ASK-V6-03 | A rota de Relatorios continua `/dashboard/weekly-reports` com rotulo novo, ou o diretorio vira `/dashboard/relatorios`? | **Mantem a rota.** So o `h1` e o rotulo do nav viram "Relatorios"; o caminho nao aparece para o usuario final e renomear tocaria `nav-config`, a captura do guia e o e2e — custo sem ganho visivel | DEC-185 |
| ASK-V6-04 | O quirk `showDashboard` = `[GERENTE_PROJETO]` (COORDENADOR/GERENTE nao veem a aba Dashboard de Projetos) e intencional? | **E bug: alinhar com o `hasGodMode` da propria pagina.** A aba passa a `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` — uniao, **ninguem perde** o que ja via | DEC-186 |
| ASK-V6-05 | A acao `suspender` de usuario (`ModernAdminPanel`) mostra **nome de terceiros** (`purchase-approval`) — isso entra no escopo de privacidade? | **Fora do escopo.** Sao telas de gestao, em que identificar o titular do registro e o proposito da tela; o plano nao amplia visibilidade nenhuma e o **CPF** segue restrito (DEC-138) | DEC-187 |
| ASK-V6-06 | O titulo do navegador e a mesma string generica em todas as telas (medido). Cada rota deve declarar o proprio titulo? | **Corrigir**, por efeito no cliente dentro do `PageHeader` (`document.title = "<titulo> · DisplayQuest"`), sem RSC e sem `layout.tsx` por segmento; o fallback de `app/layout.tsx` passa a citar o produto | DEC-188 |
