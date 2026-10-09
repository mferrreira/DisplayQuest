# plan-v6 · SPEC — refatoracao visual UI/UX (linguagem DisplayQuest)

> Contrato de **comportamento** da refatoracao `plan-v6`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.
> O "como" (ordem, arquivos, gates por etapa) fica no `PLAN.md` desta pasta.
>
> **Nota de evidencia:** todas as referencias `arquivo:linha` abaixo foram **medidas no
> repo em 2026-10-07** (auditoria depois da primeira redacao). Se uma linha mudar, o
> numero daqui vira invalido — releia o arquivo, nao confie na citacao.

## 1. Proposito

Evoluir a interface **existente** do DisplayQuest para a linguagem visual das
referencias da skill `displayquest-ui`, preservando implementacao, dados e comportamento
sempre que possivel. Nao e reconstrucao da aplicacao: e alinhar hierarquia, cor, borda,
tipografia, cards, badges, navegacao e composicao as referencias, e eliminar a
recriacao desnecessaria de componentes que ja existem.

Fronteira da funcionalidade: **somente camada de apresentacao** (`app/`, `components/`,
`features/`, `app/globals.css`, docs de UI e a propria skill). Zero mudanca de schema,
zero endpoint, zero regra de negocio, zero dependencia nova (RF-V6.10).

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
| `Tabs` e `Collapsible` importados sem uso no dialog do projeto | `project-detail-dialog.tsx:8` (import morto) |

### 2.2 Padroes recriados em vez de reaproveitados

| Padrao repetido | Ocurrencias medidas |
|---|---|
| Cabecalho de pagina | **11 `<h1>` em 11 arquivos**, com **8 `className` distintos** (`text-2xl font-bold`, `text-2xl font-bold mb-6`, `mb-6 text-2xl font-bold`, `text-3xl font-bold tracking-tight`, `text-3xl font-bold text-foreground`, `text-3xl font-black tracking-tight md:text-4xl`, `text-3xl font-bold mb-4 text-center`, `text-2xl font-bold text-gray-900 dark:text-foreground`). Nenhum componente PageHeader |
| Stat card (idioma `items-center justify-between space-y-0 pb-2` + `text-2xl font-bold`) | **6 arquivos**: `app/(dashboard)/dashboard/projetos/page.tsx` (`:162,175,188,201`), `components/ui/project-detail-dialog.tsx` (`:194,204,214,224`), `components/features/project-manager-dashboard.tsx`, `components/features/volunteers-management.tsx`, `components/features/project-hours-stats.tsx`, `components/admin/AdminStatsCards.tsx` |
| Estado vazio (`text-center py-8` + icone + titulo + botao) | **~15 blocos**; 3 no escopo central |
| Mapa status→cor | **4 fontes de verdade**: `statusColors`/`statusLabels` duplicados em `components/features/project-list.tsx:15` e `:21` vs `components/ui/project-detail-dialog.tsx:73` e `:79`; `taskStatusColors` em `project-detail-dialog.tsx:85`; `priorityBadgeClass` (`:100`)/`statusBadgeClass` (`:113`)/`PRIORITY_LABEL` (`:85`)/`STATUS_LABEL` (`:92`) em `features/tasks/components/task-card.tsx` |
| Campo de busca | **2 implementacoes**: `Input pl-10` na pagina de Projetos vs `<input>` escrito a mao em `features/tasks/components/board-toolbar.tsx:259` |
| Lista de links do projeto | **2 tratamentos**: `project-list.tsx:181-199` vs `project-detail-dialog.tsx:378-430` (form `:405-406`, render `:412-430`) |

### 2.3 Divergencias de linguagem visual (referencia vs codigo)

| # | Referencia diz | Codigo faz | Evidencia |
|---|---|---|---|
| D1 | Sidebar vertical persistente no desktop + header horizontal compacto; `anti-patterns > Excessive pills` proibe virar navegacao em pill | So header com pills `rounded-full` | `app-header.tsx:57,72` |
| D2 | `anti-patterns > Decorative gradients` | **39 ocurrencias de gradiente**: cabecalho de coluna, tons do cartao, badges, chip de pontos, gradiente do header | `board-column.tsx:57-61`, `task-card.tsx:103-124,376-384,451,505,511`, `app-header.tsx:148,150,192` |
| D3 | Colunas Kanban com distincao **sutil** e cores contidas | Cabecalho **gradiente saturado** (`from-emerald-600 to-green-500`, `from-purple-600 to-violet-500`, ...) com emoji como status | `board-column.tsx:55-62` |
| D4 | "Prefer a light border over a strong shadow" | `hover:shadow-md` (**5×**), `rotate-2 shadow-2xl` no arraste, `shadow-md` 12×, `shadow-lg` 10× | `project-list.tsx:123`, `task-card.tsx:393` |
| D5 | `anti-patterns > Card explosion` | Detalhe do projeto = **9 Cards empilhados dentro de um Dialog**, 4 deles stat cards | `project-detail-dialog.tsx` (9 × `<Card>`) |
| D6 | Icones de linha simples, peso consistente | Emoji como status de coluna (`🕐 ✏️ 👁️ ⚠️ ✅`) e no titulo da tarefa (`⚡ 🌍`) | `board-column.tsx:57-61`, `task-card.tsx:431-432` |
| D7 | Hierarquia tipografica limpa | 11 `<h1>` com 8 classNames distintos; `font-black` no Ranking; `CardTitle` (padrao `text-2xl`) rebaixado a mao em quase todo uso | 2.2 / grep `<h1` |
| D8 | Superficies claras; cor por significado | **928 classes de paleta cravadas** em `.tsx` (sem token) — top: `text-blue-300` 27, `text-gray-500` 24, `text-red-400` 22, `text-green-300` 21, `text-gray-600` 21, `bg-blue-50` 19, `text-red-600` 17, `bg-blue-100` 16. Cada uma com par `dark:` casado a mao | grep global |
| D9 | Badges compactos e levemente coloridos | Badges `font-bold text-white` com degradê e `animate-pulse` (pts, prioridade, status, QUEST GLOBAL) | `task-card.tsx:497,501,505,511,451` |
| D10 | **Uma** regiao de titulo por pagina | Projetos tem **dois titulos empilhados**: `h1` da pagina + `h2 "Projetos"` dentro da aba | `app/(dashboard)/dashboard/projetos/page.tsx:143`, `project-list.tsx:88` |
| D11 | Busca e filtros formam uma toolbar coerente | Busca artesanal no quadro vs `Input` na Projetos; larguras `w-[220px]`, `w-[200px]`, `w-64`, `w-48` sem padrao | `board-toolbar.tsx:152,172,243,263` vs `projetos/page.tsx` |
| D12 | Escala de raio **unica** | **7 valores** em uso: `rounded-md` 53, `rounded-full` 50, `rounded-lg` 49, `rounded` (solo) 21, `rounded-sm` 11, `rounded-xl` 10, `rounded-2xl` 4 | grep |
| D13 | Home: regiao de cabecalho + resumo + quadro dominante + coluna secundaria | Home = `h1 "Painel de Tarefas"` + `TaskBoard`; **sem regiao de cabecalho, sem resumo, sem coluna secundaria** — e o alvo TB nao ganha coluna secundaria (DEC-114); ganha regiao de cabecalho + resumo | `app/(dashboard)/dashboard/page.tsx:14-16` (18 linhas) |
| D14 | Projetos: **lista vertical** enriquecida + coluna de visao geral | **Grade de 2/3 colunas de cards** + 4 stat cards no topo | `project-list.tsx:121` (`grid gap-4 md:grid-cols-2 lg:grid-cols-3`) |
| D15 | pt-BR em tudo | `sr-only "Close"` em `components/ui/dialog.tsx:50` e `components/ui/sheet.tsx:71` (aparece como botao `Close` no manifesto DOM medido) | grep |

> **Fato util do dark:** o cabecalho de coluna **ja desliga o gradiente no dark**
> (`dark:bg-none dark:bg-slate-800` em `board-column.tsx:57-61`). Ou seja: no escuro
> esta correto, e no claro e que esta errado.

### 2.4 As tres telas do nucleo

**Home (`/dashboard`)** — `app/(dashboard)/dashboard/page.tsx` (**18 linhas**): `h1`
(`:14`) + `TaskBoard` (`features/tasks/components/task-board.tsx`, **340 linhas**) →
`board-toolbar.tsx` (**289**), `board-column.tsx` (**177**), `task-card.tsx` (**679**),
`archive-section.tsx` (**75**). E a tela **melhor testada** do repo: **10 arquivos** em
`features/tasks/__tests__/` (7 `.tsx` de componente + 3 `.ts` de regra) +
`tests/e2e/task-board.spec.ts`.

**Projetos (`/dashboard/projetos`)** — `page.tsx` (**316 linhas**): `h1` (`:143`) + 4
stat cards (`:162,175,188,201`) + filtros + `Tabs` (Dashboard/Lista/Voluntarios) +
2 dialogos. Usa o **contexto legado** `useProject` (`:46`), nao o `useProjects` TanStack
do quadro — dois caminhos de dados para a mesma coisa. Contagens ja derivadas em
`:66-68`. **Zero testes.**

**Projeto** — **nao e rota**, e um `Dialog`
`project-detail-dialog.tsx` (**478 linhas**) com:
- scroll duplo: `DialogContent className="max-w-4xl h-[90vh]" style={{ overflowY:'auto' }}` em `:135` + interno `space-y-6 overflow-y-auto max-h-[70vh]` em `:174`;
- **9 `<Card>`** empilhados, 4 deles stat cards (`:194,204,214,224`);
- **7 ocorrencias de porta de permissao**, em **7 linhas** e **5 expressoes distintas**:

| Linha | Expressao | O que condiciona |
|---|---|---|
| `:150` | `hasAccess(user.roles, "EDIT_PROJECT")` | botoes **Editar** e **Excluir** no cabecalho |
| `:254` (envolve `:256` **Importar Backlog** e `:260` **Criar Tarefa**) | `hasAccess(user.roles, "CREATE_TASK")` | acoes no cabecalho de Tarefas do Projeto |
| `:276` | `hasAccess(user.roles, "CREATE_TASK")` | **Criar Primeira Tarefa** no estado vazio |
| `:389` | `hasAccess(user?.roles \|\| [], "EDIT_PROJECT")` | form de **edicao de Links** |
| `:441` | `project.leaderId === user.id` | `ProjectLeaderLogs` (Logs do Projeto) |
| `:446` | `leaderId === user.id \|\| hasAccess(user.roles, "MANAGE_USERS")` | `ProjectReportsPanel` (Relatorios) |
| `:452` | `hasAccess(MANAGE_PROJECT_MEMBERS) \|\| roles inclui COORDENADOR \|\| roles inclui GERENTE` | `ProjectMembersManagement` (membros) |

Tambem tem `handleCreateTask` (`:101`), `handleAddLink` (`:116-122` com a mutacao
`project.links = [...]` em `:122`). **Zero testes.**

### 2.5 Limites de dados (nao da para mostrar, nao pode ser inventado)

| Elemento da referencia | Existe? | Evidencia |
|---|---|---|
| Tags de projeto/tarefa | **NAO** | `entities/project.ts:9-18` nao tem tags; `Task` tambem nao |
| Membros com avatares na LISTA | **NAO** (N+1) | `members` so via `GET /api/projects/[id]/members` (`lib/api/endpoints/projects.ts:46-53`); o `GET /api/projects` nao traz |
| Progresso do projeto | **SIM** (derivado de `tasks`, ja carregadas na pagina) | `project-manager-dashboard.tsx:70-75` ja calcula |
| Contagens de status | **SIM** | `projetos/page.tsx:66-68` ja conta active/completed/archived |
| `Atividade recente` / feed | **NAO** | nenhuma API de feed |
| Inicio/Termino do projeto | **NAO** | so `createdAt` (`entities/project.ts:13`) |
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
| `SKILL.md:22-24` | lista so `home.png` (`:23`) e `projects.png` (`:24`); **faltam `project.png` e `home-darkmode.png`** |
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
| `features/tasks/__tests__/*` (10 arquivos) | mesmos fragmentos + toasts + estados vazios |
| `tests/e2e/shell.spec.ts:31` | `page.locator("header")` visivel |
| `task-card.tsx:179,408,427,492,542,586,611` | `aria-label` — `Ações para`, `Arrastar tarefa`, `Ver detalhes de`, `Progresso de`, `Concluir subtask`, `Aprovar tarefa`, `Rejeitar tarefa` |

**Sem teste nenhum hoje** (precisam de caracterizacao ANTES de mudar): `ProjectList`,
`ProjectDetailDialog`, `nav-config`, `AppHeader`, `MobileMenu`, `ModernAdminPanel`.

Gotchas que a execucao precisa respeitar (AGENTS.md): shims Radix em `tests/setup.ts`;
jsdom sem `window.localStorage`/`window.matchMedia` (Toaster do Sonner exige stub
**local** ao teste); `getByLabel` casa por substring (rotulo novo nao pode conter o
rotulo do elemento que ele governa); `userEvent.setup({delay:null})` sob carga; jsdom sem
`window.confirm`; rejeitada nao tratada fecha o gate com exit 1.

### 2.8 Linha de base de teste (2026-10-07)

- **G0** `arch:check`: 787 modulos / 3077 dependencias, zero violacao, allow-list vazia
- **G3** `tests/unit` + `features`: **87 arquivos / 1107 testes** verdes (~22s)
- Suíte completa: **97 arquivos / 1192 testes**
- e2e do quadro: **2 passando + 1 falha conhecida** (cartao a mais na coluna, dado
  legitimo da instancia — confirmar com `git stash` antes de caçar regressao) **+ 5
  "did not run"** (spec serial); e2e do shell: **5 passando**

## 3. Atores e papeis

| Ator | Papel | Interacao nesta funcionalidade |
|---|---|---|
| Dono do DisplayQuest | decide a linguagem visual | fornece as referencias, decide as DEC-105..112, aprova visualmente cada onda |
| Usuario logado (todos os papeis) | usa as telas | navega, filtra, busca, arrasta cartoes, cria/edita/aprova — **o comportamento nao muda** |
| Coordenador / Gerente | portas de gestao | ve exatamente os mesmos botoes de hoje nas mesmas telas |
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

### RF-V6.6 — Projeto vira rota `/dashboard/projetos/[id]`

- **Descricao:** o `Dialog` de 90vh e substituido por uma rota de pagina; os dois pontos
  de entrada passam a navegar para ela; todo o conteudo e todas as portas de permissao
  sao preservados, e o empilhamento de 9 cards vira secoes separadas por respiro.
- **Fronteira:** `app/(dashboard)/dashboard/projetos/[id]/page.tsx` (novo),
  `components/ui/project-detail-dialog.tsx` (vai embora)
- **Entradas/Saidas:** `projectsApi.getById(id)` + `projectsApi.members(id)` (1 fetch,
  viavel so aqui); mesmo dado de `tasks`
- **Cenario principal:**
  Given um usuario autenticado
  When ele clica em ver um projeto
  Then a rota abre com o mesmo conteudo de hoje
- **Regras:**
  - R1: as **7 ocorrencias de porta** (7 linhas, 5 expressoes — tabela da §2.4) continuam com resultado
    identico. **Medir a porta do servidor antes** (DEC-92) antes de escrever o gate.
  - R2: **nenhum conteudo some** — todo bloco do dialog tem lugar na pagina (checklist
    em §8.4).
  - R3: `nav-config` ja tem `matchPrefix: true` para `/dashboard/projetos`
    (`nav-config.ts:45`) → "Projetos" segue ativo em `/dashboard/projetos/5`.
  - R4: `client-layout.tsx:21-23` ja monta `DashboardProviders` para
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
  - R1: `ModernAdminPanel.tsx` (**1165 linhas**, **zero testes**) tem caracterizacao
    **antes** de qualquer mudanca; hoje so `tsc` o cobre.
  - R2: nenhuma regra de negocio, guarda de permissao ou chamada de API muda.
  - R3: Login/Register ganham um `h1` (hoje tem **zero** `h1`/`h2`/`h3` no DOM).

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

- **Descricao:** a skill e os agentes/comandos passam a descrever as 4 referencias, o
  tema escuro e a ausencia de ilustracao, e o comando de refactor passa a nomear o gate
  real do repo.
- **Fronteira:** `.opencode/skills/displayquest-ui/SKILL.md`,
  `.opencode/skills/displayquest-ui/references/*.md`,
  `.opencode/agents/ui-reviewer.md`, `.opencode/commands/ui-refactor.md`
- **Regras:**
  - R1: `SKILL.md` lista `home.png`, `projects.png`, `project.png` e `home-darkmode.png`
    (este ultimo como autoridade do dark).
  - R2: **nenhuma secao remanescente manda usar ilustracao ou texto manuscrito**
    (`visual-language.md:16-17,30,35,48,54`, `anti-patterns.md:54`,
    `layout-patterns.md:135`, `design-system.md:93`, `components.md:36`).
  - R3: `ui-reviewer.md:31` deixa de exigir ilustracao e passa a verificar a **ausencia**
    de artwork decorativo.
  - R4: `ui-refactor.md:33` nomeia o gate concreto (`arch:check` + `lint` + `tsc --noEmit` +
    `vitest run`) em vez de "the relevant checks".
  - R5: os arquivos de skill/agent/command **nao sao** codigo — mudancas neles nao
    alteram gate tecnico, mas entram no mesmo commit da onda V6-0.

### RF-V6.10 — Invariantes de comportamento

- **Descricao:** nada alem de apresentacao muda.
- **Fronteira:** todas
- **Regras:**
  - R1: **zero** mudanca em `prisma/`, `backend/`, `app/api/`, `lib/auth/`,
    `lib/api/endpoints/`, `contexts/` (data layer), `features/*/hooks/`,
    `features/*/utils/`.
  - R2: **zero** dependencia nova em `package.json`.
  - R3: **zero** rota nova alem de `/dashboard/projetos/[id]`; **zero** endpoint novo.
  - R4: nenhum rotulo visivel, toast, `aria-label` ou `testid` muda de texto.
  - R5: comportamento de tema (default light, `enableSystem`) nao muda.

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Portabilidade visual | Tela coerente em 320/768/1024/1440 px | `/ui-review` + inspecao; `responsive behavior` do `ui-reviewer` |
| A11y | Hierarquia de heading e rotulos acessiveis preservados | `getByRole("heading")`/`getByLabel` da suíte existente verdes |
| Regressao | Nenhum teste existente quebra | `npx vitest run` zero failure, `>= 87/1107` |
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

### 7.3 Rotas de pagina novas

| Rota | Arquivo | Auth | Observacao |
|---|---|---|---|
| `GET /dashboard/projetos/[id]` | `app/(dashboard)/dashboard/projetos/[id]/page.tsx` | guard de sessao do grupo (`app/(dashboard)/layout.tsx:19-21`) | substitui o `ProjectDetailDialog`; **unica rota nova do plano** |

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
| `features/projects/__tests__/project-detail-page.test.tsx` | RF-V6.6 — as 7 portas, por papel |

### 8.2 Gates

```
npm run arch:check          # G0 — exit 0, allow-list vazia (baseline 787/3077)
npm run lint                # G1 — nenhum erro
npx tsc --noEmit            # G2 — 0 erros
npx vitest run              # G3 — zero failure (baseline 87/1107 -> >= 87/1107)
npm run docs:build && npm run docs:check   # G5 — obrigatorio nas ondas visiveis
# e2e (requer dev server em :3001):
npx playwright test tests/e2e/shell.spec.ts        # 5 passando
npx playwright test tests/e2e/task-board.spec.ts   # 2 passando + 1 falha conhecida + 5 did not run
```

### 8.3 Contagem esperada ao final

- `tests/unit` + `features`: **>= 95 arquivos / >= 1180 testes** (87/1107 + os 8
  arquivos de §8.1)
- suíte completa: **>= 105 / >= 1265**
- e2e: mesma faixa de hoje (**nao piora**) — a falha conhecida do 3o teste e dado da
  instancia, nao codigo (confirmar com `git stash` se mudar)

### 8.4 Checklist de conteudo do dialog (para AC-V6-19)

Todo item abaixo tem de existir na rota `/dashboard/projetos/[id]`:

| # | Bloco | Origem no dialog | Porta |
|---|---|---|---|
| 1 | Nome + badge de status + "Criado em {data}" | `:139-146` | — |
| 2 | Botoes **Editar** / **Excluir** | `:150-169` | `EDIT_PROJECT` |
| 3 | Descricao do projeto (se houver) | `:177-185` | — |
| 4 | 4 stat cards (Total / Concluidas / Em Progresso / Pendentes) | `:189-231` | — |
| 5 | **Progresso Geral** (barra) | `:234-244` | — |
| 6 | **Tarefas do Projeto** + **Importar Backlog** | `:248-264` | `CREATE_TASK` |
| 7 | Lista de tarefas (ou estado vazio + **Criar Primeira Tarefa**) | `:266-306` | `CREATE_TASK` |
| 8 | **Informacoes do Projeto** (Detalhes + Resumo) | `:327-369` | — |
| 9 | **Links** + form **Adicionar Link** | `:378-430` | `EDIT_PROJECT` no form |
| 10 | **Logs do Projeto** | `:440-444` | `leaderId === user.id` |
| 11 | **Relatorios de Projeto** | `:445-449` | `leaderId` ou `MANAGE_USERS` |
| 12 | **Membros do Projeto** (gestao) | `:451-461` | `MANAGE_PROJECT_MEMBERS`/`COORDENADOR`/`GERENTE` |
| 13 | Dialogos internos: `BacklogDialog` (`:471`) e os de tarefa | `:471+` | herdados |

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
| AC-V6-18 | Given as **7 ocorrencias de porta** da §2.4, When renderizo para cada papel, Then o resultado e **identico** ao de hoje | `project-detail-page.test.tsx` (casos por papel) | RF-V6.6 |
| AC-V6-19 | Given o checklist da §8.4, When comparo com a pagina, Then **nenhuma secao falta** | §8.4 mapeado em teste de presenca | RF-V6.6 |
| AC-V6-20 | Given cada tela restante, When olho, Then tem `PageHeader`, sem paleta cravada e sem degradê | grep por onda + `/ui-review <tela>` | RF-V6.7 |
| AC-V6-21 | Given `ModernAdminPanel`, When inicio a onda, Then a caracterizacao existe e esta verde antes | `tests/unit/components/admin/*.test.tsx` verde antes do commit de UI | RF-V6.7 |
| AC-V6-22 | Given tema escuro, When renderizo as telas do escopo, Then nenhuma usa `#000`/`#fff` puro e a hierarquia usa os tokens `.dark` | grep + revisao `/ui-review <tela> --dark` | RF-V6.8 |
| AC-V6-23 | Given a skill, When grepo `illustrat\|hand-drawn\|handwritten` nos `.md`, Then **0 mandando usar**; `SKILL.md` cita as 4 imagens; `ui-reviewer.md` nao tem a prioridade 9 de ilustracao | grep em `.opencode/skills` + `.opencode/agents` | RF-V6.9 |
| AC-V6-24 | Given a suíte inteira, When rodo `npx vitest run`, Then **zero failure** e **>= 87/1107** | gate G3 | RF-V6.10 |
| AC-V6-25 | Given o plano terminado, When comparo `package.json`, Then **nenhuma dependencia nova** | `git diff package.json` vazio | RF-V6.10 |
| AC-V6-26 | Given telas visiveis mudadas, When rodo G5, Then `docs:build` e `docs:check` verdes e as capturas de `docs/screens/` foram recapturadas (G6) | `npm run docs:build && npm run docs:check` + `git diff docs/screens` | §5 |

## 10. Fora de escopo (desta versao)

- **Funcionalidade nova**: tags de projeto, feed de "Atividade recente", busca global
  Cmd/Ctrl+K, destino de navegacao novo (`Times`, `Inventario`, `Gamificacao`), grafico
  com dependencia nova, datas de inicio/fim de projeto, avatares de membros na lista.
- **Ilustracoes e texto manuscrito** — decidido fora (DEC-109); a Fase "identidade
  ilustrada" do plano anterior foi **removida**.
- **Dark mode novo**: nao se mexe nos valores do bloco `.dark` (ja casam com a
  referencia); so se documenta e se consome.
- **Mudanca de regra/permissao**: nenhuma guarda, nenhum enum, nenhum `hasAccess`.
- **Data layer**: trocar os contextos legados de Projetos pelo TanStack `useProjects`
  e refactor de comportamento — fila separada.
- **Backend**: `prisma/`, `backend/`, `app/api/` intocados.
- **Testes e2e novos obrigatorios**: a caracterizacao e unitaria (mais estavel e na casa);
  e2e so e exigido como gate de nao-regressao.

## 11. Dependencias e bloqueadores

| Item | Tipo | Estado |
|---|---|---|
| `plan-v5` (`ready`, `activeWave: null`) | concorrencia | **ORDA RESOLVIDA (DEC-113, dono 2026-10-07):** o backend e a fonte de verdade e o front segue o back — nas colisoes o plan-v5 executa ANTES: `V6-4` x `V5-4` (wizard), `V6-5` x `V5-2` (banner/logo no detail), `V6-7` x `V5-3` (banner de perfil + podio). `V6-0`..`V6-3` nao tocam o plan-v5 |
| plan-v4 `done` (2026-10-07) | pre-condicao | cumprido |
| Dev server em `:3001` | infra p/ e2e | necessario so nas ondas com e2e |
| Leitura das referencias por modelo com visao | processo | **DEC-105**: `strata` e `muse` leem; `big-pickle` e `nemotron` nao. Inventario gravado em §2.3/§2.6 |
| Dado legitimo da instancia no quadro | ruido conhecido | 3o teste do e2e ja falha; confirmar com `git stash` |
| Aprovacao visual do dono por onda | processo | gate de aceite de cada onda |
