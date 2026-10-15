# plan-v6 — linguagem visual + redistribuição das telas (DisplayQuest)

> Demanda do dono em 2026-10-06/07 e 2026-10-14, em **duas frentes**:
> (1) **visual** — evoluir a interface existente para a linguagem visual das referências
> da skill `displayquest-ui`, **sem reconstruir**, preservando implementação, dados e
> comportamento; (2) **redistribuição** — repensar **o que aparece em cada página** e
> fechar os buracos de autorização que estão no cliente (DEC-181..184). O backend é a
> fonte de verdade e o front segue o back (**DEC-113**). As ilustrações/texto manuscrito
> **ficaram de fora** (DEC-109) e o **tema escuro passa a ser coberto** na skill
> (DEC-110). Escopo: **todas as telas nesta rodada** (DEC-108).
>
> A fronteira da segunda frente é **apresentação + navegação**: nada de regra de negócio,
> nada de RSC, nenhum destino de navegação criado, nenhuma permissão mudando de valor.
>
> Formo herdado do plan-v3/plan-v4/plan-v5: **medição primeiro, decisões registradas
> (DEC-105+, continuidade da numeração global), um commit revertível por onda, gates
> G0–G6.** **Spec-driven:** a SPEC desta pasta é a fonte de verdade do *comportamento*;
> este PLAN é a fonte de verdade da *ordem*. **Nada aqui está executado.**

- **SPEC (contrato):** [`SPEC.md`](./SPEC.md)
- **Estado:** [`STATE.json`](./STATE.json)
- **Skill referência:** `.opencode/skills/displayquest-ui/`
- **Ferramenta de execução:** `/ui-refactor <alvo>` → gate `/ui-review <alvo>`

## 1. O que foi medido

Tudo abaixo está **medido no repo em 2026-10-06/07** e **revalidado em 2026-10-14
(pós-plan-v5)**, documentado com evidência na `SPEC.md §2`. Resumo das dores que este
plano ataca:

| Sintoma | Número medido |
|---|---|
| `<h1>` com grafias diferentes (nenhum `PageHeader`) | **11 `<h1>` / 8 `className` distintos** |
| Stat card recriado em arquivos distintos | **6 arquivos** |
| Estado vazio recriado | **~15 blocos** |
| Mapas `status→cor` duplicados | **4 fontes de verdade** |
| Implementações de busca | **2** |
| Listas de links do projeto (2 tratamentos) | **2** |
| Classes de paleta cravadas em `.tsx` | **928** (`task-card.tsx` só: 154) |
| Ocorrências de gradiente | **39** (`task-card` 23, `board-column` 6, `leaderboard` 4) |
| Valores de raio em uso | **7** (`rounded-md` 53, `rounded-full` 50, `rounded-lg` 49, `rounded` solo 21, `rounded-sm` 11, `rounded-xl` 10, `rounded-2xl` 4) |
| CSS morto (`--sidebar-*`, `.card-hover`, `.btn-hover`) | tokens **com zero uso** |
| Segundo sistema de botão (`ModernButton`) | usado só pelo toggle de tema |
| Navegação em pill `rounded-full` (anti-pattern da referência) | `app-header.tsx:57,72` |
| Tela com dois títulos empilhados | Projetos (`h1` `:143` + `h2 "Projetos"` `project-list.tsx:88`) |
| Detalhe do projeto num `Dialog` de 90vh com scroll duplo | **621 linhas**, **14 painéis**, **10 `<Card>`** |
| Portas de permissão do detalhe do projeto | **8 expressões** — 7 inline + a nomeada `canManageProjectFiles` (`:165-171`), consumida por **6 blocos** |
| `ModernAdminPanel` (**1339 linhas**, **8 abas**) sem teste nenhum | coberto só por `tsc` |
| Voluntários mora na página de **Projetos** | `volunteers-management.tsx` (**479 linhas**) — conteúdo administrativo |
| Rota `loja/gerenciar` | **422 linhas**, **zero inbound** (duplicata da aba Gerenciar) |
| Chaves de permissão mortas/duplicadas | `DASHBOARD_PROJETOS` (**0 consumidores**), `MANAGE_REWARDS` em **2 matrizes**, página e nav de relatórios com chaves diferentes do mesmo valor |
| `/dashboard/admin` sem guarda de servidor | `admin/page.tsx:52` reimplementa `DASHBOARD_ADMIN`; negativa é corpo com **HTTP 200** |

E a boa notícia medida: **o bloco `.dark` de `app/globals.css:55-99` já é o que a
referência mostra** — a lacuna do tema escuro é **texto na skill**, não CSS.

## 2. Decisões do dono (registradas; numeração global continua)

| ID | DEC | Decisão | Origem |
|---|---|---|---|
| D-A | **DEC-105** | Leitura das referências por modelo com visão (`strata`/`muse`/`longcat`); `big-pickle` e `nemotron` não leem imagem. Inventario gravado na SPEC §2.3/§2.6. | conversa 2026-10-06 |
| D-B | **DEC-106** | Sidebar desktop entra como onda (fase 2), mantendo o `<header>` exigido por `shell.spec.ts` e `nav-config.ts` como fonte única. | conversa 2026-10-06 |
| D-C | **DEC-107** | Detalhe do projeto vira **rota** `/dashboard/projetos/[id]`; o `ProjectDetailDialog` sai. | conversa 2026-10-06 |
| D-D | **DEC-108** | Escopo = **todas as telas** nesta rodada (admin, loja, laboratório, ranking, perfil, login incluídos). | conversa 2026-10-07 |
| D-E | **DEC-109** | Ilustrações e texto manuscrito **fora**; skill e `ui-reviewer` ajustados para exigir a **ausência** de artwork decorativo. | dono, 2026-10-07 |
| D-F | **DEC-110** | Tema escuro = variante de **primeira classe**, apoiada nos tokens `.dark` que já existem; skill passa a documentá-lo. | dono, 2026-10-07 |
| D-G | **DEC-111** | Execução por `/ui-refactor` + gate `/ui-review`, com os **primitivos centrais antes** de qualquer tela (evita recriar o mesmo componente 6× de novo). | conversa 2026-10-07 |
| D-H | **DEC-112** | **Nenhuma funcionalidade nova** — sem tags, feed, busca global, gráfico com dependência, destinos de navegação novos. | conversa 2026-10-07 |
| D-I | **DEC-113** | **Ordem frente ao plan-v5:** não roda primeiro. O backend é a fonte de verdade e o front é implementado seguindo o back — nas colisões (V6-4×V5-4, V6-5×V5-2, V6-7×V5-3) o **plan-v5 executa antes**. V6-0..V6-3 não tocam o plan-v5. | dono, 2026-10-07 |
| D-J | **DEC-114** | **Home sem coluna secundária:** o draft tem 4 colunas e o DisplayQuest mantém 5 (DEC-112), então o quadro **reaproveita a largura horizontal toda** para não espremer as tasks; o resumo fica na região de cabeçalho, acima do quadro. | dono, 2026-10-07 |
| D-K | **DEC-181** | **Relatórios viram um destino só:** uma página com **3 abas** (por usuário / por projeto / atestados) + **assistente de 3 passos**; o que se unifica é o **fluxo de geração**, não o inventário — nenhum bloco sai do detalhe do projeto, e a aba **Templates fica fora**. | dono, 2026-10-14 |
| D-L | **DEC-182** | **Voluntários sai de Projetos e vira aba do Painel Administrativo**; o conjunto medido vira a chave `DASHBOARD_VOLUNTEERS` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`. | dono, 2026-10-14 |
| D-M | **DEC-183** | **O detalhe do projeto vira 5 abas** (Visão geral / Tarefas / Membros / Arquivos / Configurações) com rail direito, como a referência; a distribuição é congelada para não ser relitigada. | dono, 2026-10-14 |
| D-N | **DEC-184** | **Painel Administrativo corta a aba `settings`** (placeholder) e cada aba declara a **chave que a governa**, mostrando o **motivo** em vez de vazio. | dono, 2026-10-14 |
| D-O | **DEC-185** | **A rota de Relatórios não muda:** o diretório continua `/dashboard/weekly-reports`; só o `h1` e o rótulo do nav viram **Relatórios**. | dono, 2026-10-14 (ASK-V6-03) |
| D-P | **DEC-186** | **A invisibilidade da aba Dashboard de Projetos para COORDENADOR/GERENTE é bug:** a aba passa à chave nomeada `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (o `hasGodMode` da própria página). Sem funcionalidade nova: quem não lidera projeto vê o estado vazio que o componente já tem. | dono, 2026-10-14 (ASK-V6-04) |
| D-Q | **DEC-187** | **Nomes de terceiros em telas de gestão ficam fora do escopo** (fila de compras, painel admin): o propósito da tela é identificar o titular do registro; nada de visibilidade nova e o **CPF** segue restrito (DEC-138). | dono, 2026-10-14 (ASK-V6-05) |
| D-R | **DEC-188** | **Título do navegador por tela, por efeito no cliente dentro do `PageHeader`** (`document.title = "<título da tela> · DisplayQuest"`) — sem RSC e sem `layout.tsx` por segmento; `app/layout.tsx` mantém o fallback, com o nome do produto. | dono, 2026-10-14 (ASK-V6-06) |

> **Próxima decisão livre: DEC-190.** DEC-189 é do plan-v4 (lote SUB-1, autoridade de
> subtask, 2026-10-15). Antes de abrir DEC nova, `grep` os **cinco**
> `STATE.json` (regra global da casa — a numeração é global e já tem buraco). O plan-v5
> tomou a DEC-180 em 2026-10-14 (V5-fix-2, "Gerar DOCX"), por isso as decisões da revisão
> nasceram em 181..184 e as **quatro respostas às ASK** em 185..188, no mesmo dia.

## 3. Ondas (ordem obrigatória)

Cada onda = **um commit revertível**, com `dc` (done criteria) observáveis e gate.
**Única exceção: V6-0** — `.gitignore:7` ignora `.opencode/**`, então essa onda não
gera commit; a prova dela é o grep de AC-V6-23 e o diff local.
A SPEC é quem define o *comportamento*; esta tabela define a *ordem* e o *tamanho*.

| # | Onda | Por que nesta posição | DC (done criteria) | Gate da onda |
|---|---|---|---|---|
| **V6-0** | Skill e ferramenta alinhadas | é pré-condição: o `/ui-review` e o `ui-reviewer` guiam **todas** as demais ondas | 3 gaps corrigidos: `SKILL.md` cita as **5** imagens (hoje cita 2); `ui-reviewer.md:31` deixa de exigir ilustração; `ui-refactor.md` nomeia o gate real. **G2 decidido** (consertar ou registrar a dívida do `tsc`) | grep de AC-V6-23 + `git diff` só em `.opencode/**` |
| **V6-1** | Tokens + primitivos compartilhados | **pré-condição central** (D-G): sem ela, cada tela recria `PageHeader`/`StatCard` de novo | `PageHeader`, `StatCard`, `EmptyState`, `SearchInput`, `components/ui/status.ts` + 5 testes novos; o `PageHeader` **também declara o título do navegador** por efeito no cliente (DEC-188) | `vitest run tests/unit/ui` verde; `arch:check` |
| **V6-2** | Shell: sidebar desktop + header compacto + **chaves de navegação** | antes das telas, para que elas nasçam dentro do layout novo; e é aqui que o `nav-config` é a fonte única — logo, é aqui que a chave de cada destino é **unificada** (RF-V6.16 R4) | sidebar usa `nav-config`; nav sem `rounded-full`; `<header>` mantido; menu mobile intacto; `DASHBOARD_PROJETOS` (morta) **sai**; `DASHBOARD_VOLUNTEERS` **nasce**; `DASHBOARD_PROJECT_MANAGER` **nasce** com `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (DEC-186, substitui o `showDashboard` inline); página e nav de relatórios falam a **mesma chave** | `e2e/shell.spec.ts` 5 passando + `app-sidebar.test.tsx` + `permission-keys.test.ts` |
| **V6-3** | Home (`/dashboard`) | tela de destino + **a melhor testada** — primeiro teste real da nova linguagem | regiao de cabecalho, resumo só com dado já carregado, **sem coluna secundária** (quadro com largura toda, D-J), colunas sem gradiente/emoji, `PageHeader` | `vitest run features/tasks` verde + `task-board.spec.ts` não piora |
| **V6-4** | Projetos (`/dashboard/projetos`) | usa os primitivos + `status.ts`; **caracterização antes**; após o plan-v5 nesta tela (D-I × `V5-4` wizard) | 1 título; chips com contagem; lista vertical; progresso derivado; `project-list.test.tsx` **antes**; a aba **Dashboard** passa a ler `DASHBOARD_PROJECT_MANAGER` (DEC-186) e COORDENADOR/GERENTE passam a vê-la. **Não toca a aba Voluntários** — V6-9 é a dona da mudança (RF-V6.12) | `project-list.test.tsx` verde + grep de AC-V6-14/15/16 + AC-V6-30 |
| **V6-5** | Projeto → rota `/dashboard/projetos/[id]` | depois de Projetos; é a maior mudança estrutural; **após o plan-v5** `V5-2` (D-I) | rota renderiza com as **5 abas** (RF-V6.13); as **8 expressões de porta** idênticas; **nenhum dos 20 blocos** de §8.4 falta; dialog sai | `project-detail-page.test.tsx` verde (casos por papel) + AC-V6-17/18/19/31 |
| **V6-6a** | Laboratório | `PageHeader` + tokens; baixo risco | sem paleta cravada/degradê; `PageHeader` | grep da onda + `/ui-review laboratorio` |
| **V6-6b** | **Relatórios** (destino único, 3 abas + assistente) | **DEC-181**; depois do Laboratório (mesma família de telas) e **antes** de V6-8/V6-9, porque o rótulo do nav é unificado em V6-2 e o atalho do projeto depende de V6-5 | **3 abas** (usuário / projeto / atestados) + **assistente de 3 passos**; **sem** aba Templates; **nenhum bloco sai** do detalhe do projeto (o atalho fica); `h1` e rótulo do nav = **Relatórios**; a **rota continua** `/dashboard/weekly-reports` (DEC-185) | `/ui-review relatorios` + AC-V6-27/28 |
| **V6-7** | Perfil + Ranking | juntos (o Ranking é filho do Perfil); **após o plan-v5** `V5-3` (D-I), ordem resolvida | idem V6-6a; `h1` único | grep + `/ui-review perfil` |
| **V6-8** | Loja (sem a rota morta) | idem; a remoção e o alinhamento de escopo são desta onda | **`loja/gerenciar` removida** (RF-V6.15); `MANAGE_REWARDS` numa **única** matriz; o cliente pede o que o servidor já permite (RF-V6.16 R5) | grep de AC-V6-33/34/35 + `/ui-review loja` |
| **V6-9** | Admin (`ModernAdminPanel` + arredores) | **última** das telas grandes por ser a de maior risco (**1339** linhas, zero testes); é a **dona** da mudança de Voluntários | caracterização **antes**; guarda de **servidor** em `/dashboard/admin` (RF-V6.14/RF-V6.16 S3); aba `settings` **sai**; aba sem chave **diz o motivo**; aba Voluntários **adicionada aqui** e **removida de Projetos no mesmo commit** (RF-V6.12 — sem estado intermediário em que ela não exista) | `tests/unit/components/admin` + `admin-guard.test.tsx` + `admin-tabs.test.tsx` + `volunteers-tab.test.tsx` |
| **V6-10** | Login + Register + o intersticial `/` | isolada, sem dependência de shell; `/` é a mesma família (fora do grupo do dashboard) | ganham `<h1>`; sem paleta cravada; o `h1` do intersticial `/` (`app/page.tsx:22`) para de repetir a string genérica e passa a citar o produto (DEC-188) | grep + `/ui-review login` |
| **V6-11** | Fechamento: G5/G6 + greps finais + dívida | só depois de todas as telas | greps de AC-V6-01..06 **e AC-V6-27..36** em zero; **título próprio em todas as telas com `PageHeader`** (AC-V6-36); `docs:build`+`docs:check`; capturas recapturadas; `STATE.json` `done` | **G0–G6 inteiros** + relatório final |

### 3.1 Regras de avanço

1. **Ordem obrigatória** — `V6-N` só começa com `V6-(N-1)` `done`.
2. **Primitivos antes das telas** (V6-1 antes de V6-3+) — regra D-G; se uma tela
   precisar de um primitivo que não existe, **volta em V6-1**, não cria local.
3. **Caracterização antes de mexer** — `ProjectList`, `ProjectDetailDialog`,
   `nav-config`, `AppHeader`, `MobileMenu`, `ModernAdminPanel` têm **zero testes hoje**;
   em `V6-4`, `V6-5`, `V6-2` e `V6-9` o teste vem **num commit anterior** ao da UI.
4. **Um `/ui-review` por alvo** antes de dar a onda por fechada (Must/Should/Optional).
5. **Nada de dependência nova, um destino de navegação novo e nada além disso** — a única
   rota criada é `/dashboard/projetos/[id]` e a única removida é
   `/dashboard/loja/gerenciar`; nenhum item de menu é criado (§7.3 da SPEC).
6. **Ordem frente ao `plan-v5` — DEC-113 (dono, 2026-10-07; satisfeita em 2026-10-14):**
   o backend é a fonte de verdade e o front é implementado seguindo o back. O plan-v5
   **fechou** (`done`, 2026-10-14), então a colisão deixou de existir: `V6-4`, `V6-5` e
   `V6-7` leem a tela **no estado pós-plan-v5** (PROPPI, dados de pessoa e de vínculo,
   capa de perfil, cronograma, atestados e relatórios técnicos).
7. **Redistribuição = apresentação + navegação (fronteira dura).** Nenhuma regra de
   negócio, nenhum RSC, nenhum endpoint novo, nenhuma migration; o dado restrito continua
   saindo **só** pela API e o cliente **esconde**, não decide (RF-V6.16 S1/S2).
8. **Quem move uma tela move as duas pontas no mesmo commit.** A aba Voluntários sai de
   Projetos e entra no Admin em **V6-9** — sem commit intermediário em que ela não exista
   em lugar nenhum (RF-V6.12 R4).
9. **Nenhum conjunto de papéis muda de valor — com uma exceção registrada**
   (RF-V6.16 R1). Chave nova nasce com o valor **medido**. A exceção é a aba Dashboard de
   Projetos: o dono classificou a invisibilidade de COORDENADOR/GERENTE como **bug** e
   mandou alinhá-la ao `hasGodMode` da própria página (DEC-186) — a chave
   `DASHBOARD_PROJECT_MANAGER` nasce com `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`,
   união que **não tira** a aba de ninguém. Fora dela, conjunto de papéis que mude de valor
   é erro de escopo, não decisão de onda.

## 4. Etapas detalhadas (por onda)

### V6-0 — Skill e ferramenta

**Executada em 2026-10-15 (sem commit: `.opencode/**` é gitignored).**

- `SKILL.md` passa a listar as **5** imagens de `references/visual-examples/`: `home.png`,
  `projects.png`, `project.png`, `reports.png` e `home-darkmode.png` (esta como
  **autoridade do dark**). Ganhou a seção **Themes** (dark é primeira classe, os dois temas
  saem dos tokens de `app/globals.css`, sem ramo de paleta hard-coded) e a regra "sem
  artwork decorativo".
- `references/design-system.md` → `:5`, superfície, borda, sombra, tipografia, tags e a
  escala de raio ganharam a contraparte dark, citando os tokens medidos (`--background` <
  `--card` < `--popover`, `--border`, `--success`/`--warning`/`--info`/`--destructive`,
  `--radius` 0.75rem).
- `references/visual-language.md` → `:5` e a lista de caráter pararam de dizer "light" e
  "pastel" sem qualificar tema; as seções de ilustração (`:28-50`) e de manuscrito
  (`:52-62`) **saíram** e deram lugar a **Artwork** ("sem artwork decorativo").
- `references/anti-patterns.md` → "Generic illustrations" virou **Decorative artwork**:
  "Do not use illustrations, stock-style artwork or handwritten type".
- `references/layout-patterns.md` → a linha que permitia ilustração decorativa em espaço
  vazio **saiu**.
- `references/components.md:36` → "project icon or illustration" virou "project icon or
  image".
- `.opencode/agents/ui-reviewer.md` → prioridade 9 virou "absence of decorative artwork" e
  a 4 passou a pedir cor **nos dois temas**.
- `.opencode/commands/ui-refactor.md:33` → o passo 1 do "After implementation" virou o gate
  concreto (`arch:check`, `lint`, `tsc --noEmit`, `vitest run`), apontando para o
  `STATE.json` deste plano em vez de congelar um número que as próprias ondas mudam.

**Prova do AC-V6-23 (medida 2026-10-15):** `grep -rniE 'illustrat|hand-drawn|handwritten'`
em `.opencode/skills` + `.opencode/agents` devolve **4 hits, todas frases de proibição**
(`SKILL.md:45`, `visual-language.md:28`, `anti-patterns.md:52`, `design-system.md:105`) —
**nenhuma manda usar**. `SKILL.md` cita as 5 imagens (`:23-27`). A prioridade 9 de
ilustração saiu do `ui-reviewer.md`.

**G2 (decisão registrada em 2026-10-15):** o erro pré-existente **fica como dívida
conhecida, não consertado**, e o critério de toda onda deste plano continua **não piorar**.
O erro é `getByRole` com `exact` em `features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105`
(`exact` não existe em `ByRoleOptions`); o conserto proposto é de uma linha
(`{ name: "Pausar", exact: true }` → `{ name: /^Pausar$/ }`), mas **não foi aplicado**:
sem o toolchain instalado não dá para provar que o teste continua verde, e um teste verde
não se troca por um palpite. O conserto fica para quem tiver as dependências instaladas.

**Bloqueio medido em 2026-10-15 (vale para V6-1 em diante):** esta árvore **não tem
`node_modules`** (`ls node_modules` → não existe) e a imagem `displayquest-app` é podada
(`node_modules/typescript` e `node_modules/vitest` ausentes), então **G0/G1/G2/G3 não rodam
aqui hoje**. Instalar as dependências é pré-requisito para executar a V6-1 em diante; até
lã, o critério de gate fica sem medição.

**DC:** AC-V6-23 verde. **Commit:** **nenhum** — `.gitignore:7` ignora `.opencode/**` desde
antes deste plano, entao a onda nao entra no versionamento (a prova e o grep e o diff local).

### V6-1 — Tokens + primitivos

- Novos: `components/ui/page-header.tsx`, `stat-card.tsx`, `empty-state.tsx`,
  `search-input.tsx`, `components/ui/status.ts`.
- `status.ts` concentra o que hoje está espalhado em três lugares:
  `statusColors`/`statusLabels` (`project-list.tsx:15`/`:21` e as cópias do dialog
  `project-detail-dialog.tsx:79`/`:85`), `taskStatusColors`
  (`project-detail-dialog.tsx:91`) e o que mora no cartão — `PRIORITY_LABEL`
  (`task-card.tsx:85`), `STATUS_LABEL` (`:92`), `priorityBadgeClass` (`:100`) e
  `statusBadgeClass` (`:113`).
  Nesta onda as duas cópias de `statusColors` passam a importar de `status.ts` (troca
  mecânica — o dialog inteiro sai em V6-5); as do cartão migram em V6-3.
- Testes: `tests/unit/ui/{page-header,stat-card,empty-state,search-input,status-badges}.test.tsx`.
- **Título do navegador (DEC-188):** `page-header.tsx` é **client** e, num `useEffect`,
  escreve `document.title = "<título da tela> · DisplayQuest"`. Não há RSC, nem
  `layout.tsx` por segmento, nem `metadata` em `page.tsx` (Next: server-only). A prop de
  título é **obrigatória** — tela que adota o primitivo ganha o título sem trabalho extra,
  e o teste asserta `document.title` além do `<h1>`. O fallback fica onde está (rotas sem
  `PageHeader`, hoje só o intersticial `/`), trocando a string genérica medida pelo nome do
  produto (`app/layout.tsx`); o `h1` do intersticial acompanha em V6-10.
- **Não** aplicar nas telas ainda (só os primitivos + as trocas mecânicas acima).

**DC:** AC-V6-04/05/06/07/36 nas linhas de base; 5 arquivos de teste verdes.
**Commit:** `primitivos UI + status.ts`.

### V6-2 — Shell + chaves de navegação

- `components/layout/app-sidebar.tsx` (novo) + `app-header.tsx` reduzido (identidade,
  sino, tema, avatar) — **`<header>` permanece** (AC-V6-08).
- Item de nav extraído e compartilhado entre sidebar e `mobile-menu.tsx` a partir do
  `nav-config.ts` (sem destino novo, AC-R1 de RF-V6.3).
- Remover `rounded-full` dos itens de navegação (AC-V6-09).
- **Caracterização antes:** `tests/unit/layout/app-sidebar.test.tsx` +
  teste de `nav-config`/`AppHeader`.
- Tokens `--sidebar-*` (já existentes) passam a ser usados — **zero CSS novo**.
- **Chaves de permissão (RF-V6.16 R4), aqui porque `nav-config` é a fonte única da
  navegação:** `DASHBOARD_PROJETOS` (**0 consumidores**) **sai**; **nasce**
  `DASHBOARD_VOLUNTEERS` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` (o `showVolunteers`
  medido); **nasce** `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`
  (DEC-186 — o `showDashboard` **corrigido**; a chave entra aqui, o consumo troca em V6-4);
  a **página e o nav** de relatórios passam a falar **a mesma chave**; guarda
  `tests/unit/domain/identity/permission-keys.test.ts` (AC-V6-34).
- **A união da DEC-186 não é cópia da DEC-182:** os dois conjuntos têm hoje o mesmo valor e
  governam recursos diferentes (aba do Admin x aba de Projetos). Não unifique as chaves nem
  "aproveite" uma na outra — são duas decisões independentes.
- **A única exceção registrada de "nenhum conjunto muda de valor"** é a chave acima
  (DEC-186). Fora dela, chave nova nasce com o valor medido.

**DC:** `shell.spec.ts` 5 passando; `app-sidebar.test.tsx` e `permission-keys.test.ts` verdes,
com as duas chaves novas na matriz no valor da decisão.
**Commit:** `shell: sidebar desktop + chaves de navegação`.

### V6-3 — Home

- `dashboard/page.tsx` ganha `PageHeader` com saudação + blocos de resumo **só** com
  dado já carregado (`overdueCount`, `isTaskDueToday`, `status === "done"`,
  `useProjects()`, `user.points`) — **sem** feed, **sem** status de sistema, **sem**
  fetch de ranking (R1 de RF-V6.4).
- **Sem coluna secundária (DEC-114):** o quadro de 5 colunas ocupa a largura horizontal
  toda e os blocos de resumo vão na região de cabeçalho, **acima** do quadro.
- `board-column.tsx` → tinta chapada no lugar do degradê saturado, `lucide` no lugar do
  emoji; contagem sem pill `bg-white/20` (D3, D6).
- `task-card.tsx` → superfície chapada, badges por token (sem gradiente/`font-bold
  text-white`/`animate-pulse`), `lucide` nos ícones (D9, D6).
- **Trava:** nenhum rótulo/`aria-label`/`testid`/toast do quadro muda (SPEC §2.7).
- Remover `rounded-xl`/`shadow-2xl`/`hover:shadow-md` do escopo (D4, D12).

**DC:** AC-V6-11/12/13. **Commit:** `home + quadro`.

### V6-4 — Projetos

- Caracterização `features/projects/__tests__/project-list.test.tsx` **antes**.
- `page.tsx` → `PageHeader` único (remove-se o `h2` da `ProjectList`);
  4 stat cards → `StatCard`; `Select` de status → chips com contagem.
- `project-list.tsx` → lista vertical + progresso derivado de `tasks` (já carregado);
  `statusColors` local **some** (usa `status.ts`).
- **Aba Dashboard (DEC-186):** `showDashboard` (`page.tsx:98`, hoje
  `roles.includes("GERENTE_PROJETO")`) **sai** e a aba passa a ler
  `hasAccess(roles, "DASHBOARD_PROJECT_MANAGER")` — a chave nasceu em V6-2 com
  `["COORDENADOR","GERENTE","GERENTE_PROJETO"]`. Efeito: COORDENADOR e GERENTE passam a
  ver a aba (era bug); `ProjectManagerDashboard` **não muda** — ele já filtra por
  `leaderId === user?.id` (`:31`) e já tem o estado vazio (`:190-197`).
- **Não tocar a aba Voluntários** — ela **continua aqui** até V6-9, que a move para o
  Admin **nas duas pontas no mesmo commit** (RF-V6.12 R4, regra 8 de §3.1). Remover
  agora deixaria um commit em que a aba não existe em lugar nenhum.

**DC:** AC-V6-14/15/16/30. **Commit:** `projetos: lista vertical + PageHeader`.

### V6-5 — Projeto → rota (5 abas)

- Novo `app/(dashboard)/dashboard/projetos/[id]/page.tsx` + refactor do conteúdo do
  dialog em **5 abas** (RF-V6.13, DEC-183): Visão geral / Tarefas / Membros / Arquivos /
  Configurações, com rail direito — sem scroll duplo, sem `h-[90vh]`.
- `projectsApi.getById(id)` + `projectsApi.members(id)` (**1 fetch por rota**, viável
  só aqui) — sem N+1.
- Os 2 pontos de entrada navegam; `ProjectDetailDialog` **sai**.
- **Medir a porta do servidor antes** (DEC-92) antes de escrever o gate das **8
  expressões de porta** (tabela congelada na `SPEC.md` §8.4). A 8ª
  (`canManageProjectFiles`, `:165-171`) governa **6 dos 20 blocos** e **já existia** —
  era só não contada.
- Preservar o checklist dos **20 blocos** da `SPEC.md` §8.4 (AC-V6-19/31). Os
  `arquivo:linha` foram **reme-didos**: o arquivo passou de 478 para **621 linhas**.

**DC:** AC-V6-17/18/19/31; `project-detail-page.test.tsx` verde (casos por papel).
**Commit:** `rota /dashboard/projetos/[id]`.

### V6-6a — Laboratório

- Caracterização se não houver → `PageHeader` → tokens no lugar de paleta cravada/degradê
  → raio/padding na escala → reaproveitar primitivos.
- **Não toca** o timer flutuante nem o auto-pause (regras de negócio, RF-V6.10 R2).

**DC:** grep da onda + `/ui-review laboratorio` sem Must aberto.

### V6-6b — Relatórios (destino único, 3 abas + assistente) — DEC-181

- A página vira **um** destino com **3 abas** (por usuário / por projeto / atestados) +
  **assistente de 3 passos** que reúne os **3 fluxos de geração** hoje separados
  (RF-V6.11).
- A **aba Templates fica fora** (DEC-112): os templates oficiais são asset de leitura do
  backend (DEC-128/130), não uma tela.
- **Nenhum bloco sai do detalhe do projeto** — a unificação é do **fluxo**, não do
  inventário; o atalho do projeto aponta para cá (AC-V6-28).
- Rótulo do nav e `h1` = **Relatórios**; a **rota** continua `/dashboard/weekly-reports`
  — o diretório só mudaria com a DEC-185 invertida, e a decisão foi manter (DEC-185).
- Vocabulário do plan-v5 preservado (`parcial|tecnico-final|final`), sem segunda lista
  (lição DEC-95/96).
- Gates por aba **preservam o resultado medido**: usuário `VIEW_WEEKLY_REPORTS`, lote
  `MANAGE_USERS`, projeto/atestado a autorização que os use cases já têm.

**DC:** AC-V6-27/28. **Commit:** `relatorios: destino unico + assistente`.

### V6-7 — Perfil + Ranking

- Juntos (o Ranking é filho do Perfil); no **estado pós-plan-v5** (capa de perfil, pódio)
  — a colisão com `V5-3` está resolvida porque o plan-v5 fechou.
- `PageHeader` + tokens; `h1` único.

**DC:** grep + `/ui-review perfil`.

### V6-8 — Loja (sem a rota morta)

- `PageHeader` + tokens nas 4 abas; **nenhuma aba nova**.

- **A rota `/dashboard/loja/gerenciar` sai** (RF-V6.15, DEC-181): 422 linhas, **zero
  inbound** medido; nada é portado — o que ela oferecia já existe na aba Gerenciar.
- **Alinhamento de escopo (RF-V6.16 R5, caso C da §2.9):** hoje `loja/page.tsx:51` usa
  `MANAGE_REWARDS` (tem GERENTE) mas `reward-context.tsx:68` usa
  `LABORATORISTA||COORDENADOR`, então um GERENTE vê a fila de Aprovações com a lista das
  **próprias** compras — o backend já autoriza (`MANAGE_PURCHASES`,
  `purchase-query-scope.ts:48-49,83-85`). O cliente passa a pedir o que o servidor
  permite.
- `MANAGE_REWARDS` fica numa **única** matriz (hoje está em duas).

**DC:** AC-V6-33/34/35 + grep da onda + `/ui-review loja` sem Must aberto.
**Commit:** `loja: remove rota morta + escopo alinhado`.

### V6-9 — Admin (guarda de servidor, corte e Voluntários)

- **Caracterização de `ModernAdminPanel` ANTES** (é o maior risco): **1339 linhas**, **8
  abas**, **zero testes** — hoje só o `tsc` o cobre.
- **Guarda de servidor (RF-V6.14 R3 / RF-V6.16 S3):** novo
  `app/(dashboard)/dashboard/admin/layout.tsx` decide com `DASHBOARD_ADMIN` no servidor;
  hoje a página reimplementa a chave em `admin/page.tsx:52` e a negativa é um corpo com
  **HTTP 200**. A frase de negação é preservada (2 testes travam o heading
  `"Painel Administrativo"`).
- **Aba `settings` sai** (placeholder, `ModernAdminPanel.tsx:994`); nenhuma outra aba
  some; cada aba restante declara **a chave que a governa** e aba sem permissão
  renderiza **o motivo**, não vazio.
- **Mudança de Voluntários (RF-V6.12, DEC-182):** `volunteers-management.tsx` (**479
  linhas**) é **movido** — mesma tabela, mesmas colunas — para a aba nova do painel, sob
  `DASHBOARD_VOLUNTEERS`, e **removido de Projetos no MESMO commit**. O administrativo
  fica acessível por `DASHBOARD_ADMIN ∪ DASHBOARD_VOLUNTEERS`, com gate **por aba**.
- Guardas: `admin-guard.test.tsx`, `admin-tabs.test.tsx`, `volunteers-tab.test.tsx`.

**DC:** `tests/unit/components/admin` verde **antes** do commit de UI; AC-V6-29/30/32.
**Commit:** `admin: guarda + corte + voluntarios`.

### V6-10 — Login + Register + o intersticial `/`

- Ganham `<h1>` (hoje: **zero** `h1`/`h2`/`h3` no DOM — o título é `CardTitle`, que
  renderiza `div`).
- Sem paleta cravada; `PageHeader` onde couber.
- **Intersticial `/` (`app/page.tsx`, fora do grupo do dashboard):** o `h1` (`:22`)
  repete a string genérica e passa a citar o produto (DEC-188). A página continua só
  redirecionando — **nenhum `<h1>` de `PageHeader`, nenhum título de navegador próprio**:
  ela herda o fallback de `app/layout.tsx`.

**DC:** grep + `/ui-review login`.

### V6-11 — Fechamento

- Greps finais **globais** do escopo: AC-V6-01..06 em zero (exceto DEC registrada).
- **Título por tela (AC-V6-36):** percorrer as telas com `PageHeader` e conferir
  `document.title` = `"<título> · DisplayQuest"`; `grep -rn "Sistema de Gerenciamento de
  Tarefas" app` → **0** (o fallback de `app/layout.tsx` e o `h1` do intersticial citam o
  produto, DEC-188).
- `package.json` intocado (AC-V6-25).
- **G5:** `docs:build` + `docs:check`. **G6:** recapturar as capturas cuja tela mudou.
- `displayquest-v2/README.md` + `AGENTS.md` (seção plan-v6) atualizados.
- `STATE.json` → `status: "done"`.

**DC:** AC-V6-01..06 e AC-V6-27..36 verificados; G0–G6 inteiros.

## 5. Gates (G0–G6)

| Gate | Comando | Baseline (medido 2026-10-14, pós-plan-v5) | Quando |
|---|---|---|---|
| **G0** | `npm run arch:check` | exit 0, allow-list **vazia**, **1026 módulos / 4383 deps** | toda onda |
| **G1** | `npm run lint` | nenhum erro (worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`) | toda onda |
| **G2** | `npx tsc --noEmit` | **NÃO PIORAR** — 1 erro pré-existente (`features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105`), **registrado como dívida no V6-0** em 2026-10-15 (não consertado: sem `node_modules` no host não há como verificar o conserto) | toda onda |
| **G3** | `npx vitest run` | **157 arquivos / 2134 testes** (unit+features), zero failure, **nunca menor** | toda onda |
| **G4** | roundtrips Prisma | **não se aplica** — plano sem backend (rodar só se alguém tocar `prisma/`, que é erro de escopo) | — |
| **G5** | `npm run docs:build && npm run docs:check` | verde | ondas com tela visível |
| **G6** | recapturar `docs/screens/` | — | quando a captura deixa de representar a tela |

**G2 está decidido (V6-0, 2026-10-15): o erro pré-existente fica registrado como dívida, não
consertado.** O `tsc` **não** fecha em 0 nesta branch; o critério de toda onda é **não
piorar**, e nenhuma onda pode exigir "0 erros" enquanto essa dívida existir. O conserto
proposto (`getByRole` sem `exact`, ver o bloco do V6-0) está anotado para quem tiver o
toolchain instalado.

**Bloqueio medido (2026-10-15):** esta árvore **não tem `node_modules`** e a imagem
`displayquest-app` é podada (sem `typescript` nem `vitest`), então **nenhum gate deste
plano roda aqui hoje**. Instalar as dependências vem antes do V6-1.

**e2e (requer dev server em `:3001`):**
`npx playwright test tests/e2e/shell.spec.ts` → 5 passando;
`npx playwright test tests/e2e/task-board.spec.ts` → 2 passando + **1 falha conhecida**
(cartão a mais na coluna — dado legítimo da instância; confirmar com `git stash`) +
5 "did not run" (spec serial).

## 6. Rollback

- **Um commit por onda** → `git revert <sha>` desfaz a onda inteira sem tocar nas outras.
- `V6-0` é só `.opencode/**` (nenhum gate técnico depende dele).
- `V6-1` adiciona primitivos **sem aplicar** → revert seguro, nenhuma tela muda. O título
  do navegador (DEC-188) mora **dentro** do `PageHeader`: reverter V6-1 depois de V6-3
  quebra as telas que já adotaram o primitivo — reverta na ordem inversa das ondas.
- **A visibilidade da aba Dashboard (DEC-186) atravessa duas ondas:** a chave nasce em
  V6-2 e o consumo troca em V6-4. Reverter **as duas** devolve o comportamento medido
  (aba só para `GERENTE_PROJETO`); reverter só V6-4 deixa a chave sem consumidor.
- A mudança mais estrutural (`V6-5`, rota) é auto-contida em
  `app/(dashboard)/dashboard/projetos/[id]/` + remoção do dialog → revert devolve o
  dialog.
- **A remoção da rota morta (`V6-8`) e a mudança de Voluntários (`V6-9`)** são cada uma
  auto-contida num commit: `git revert` devolve a rota `loja/gerenciar` e devolve a aba
  Voluntários a Projetos **inteira** (as duas pontas vivem no mesmo commit).

## 7. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Suíte do quadro é sensível a rótulo (`getByLabel` casa por substring) | rótulo novo **não pode conter** o rótulo do elemento que ele governa; `tests/e2e/task-board.spec.ts` e `features/tasks/__tests__/*` a cada mudança no quadro |
| `ModernAdminPanel` sem teste + `async` sem `catch` → `Unhandled Rejection` fecha o gate com exit 1 | caracterização em `V6-9` antes; seguir o padrão `userSettingsError` + `<p role="alert">` |
| `Toaster` do Sonner exige stub local de `matchMedia` | stub **local ao teste**, nunca global em `tests/setup.ts` (derrubaria o caminho "mobile" do quadro) |
| jsdom sem `localStorage`/`window.confirm` | copiar o padrão de `session-notes-draft.test.tsx`; `vi.stubGlobal("confirm", …)` |
| ~~Colisão com `plan-v5`~~ **resolvida** | o plan-v5 **fechou em 2026-10-14** (DEC-113 satisfeita): as telas de `V6-4`/`V6-5`/`V6-7` são refatoradas no estado pós-plan-v5 |
| Guarda de servidor do admin quebrar os 2 testes que travam o heading | a **frase** de negação e o heading autorizado são preservados; os testes entram como caracterização **antes** (V6-9) |
| A unificação de Relatórios virar perda de inventário | a fronteira é o **fluxo de geração**, não o inventário: nenhum bloco sai do detalhe do projeto (RF-V6.11 R1) — o checklist de §8.4 continua sendo o contrato |
| A redistribuição escapar para "mudança de regra" | RF-V6.16 R1: nenhum conjunto de papéis muda de valor **fora da exceção registrada da DEC-186**; `git diff` de `backend/domain/identity/permissions.ts` só pode **remover chave morta/duplicar**, criar as chaves nomeadas medidas e dar à `DASHBOARD_PROJECT_MANAGER` o valor da decisão — nunca alterar outro valor |
| Escapar escopo virar "refatoração de comportamento" | RF-V6.10 R1/R2/R3 — `git diff` de `prisma/ backend/ app/api/ contexts/ package.json` tem de ficar vazio |

## 8. Regras de numeração

- **DEC-105..114** são deste plano (§2, inclui D-I/D-J do dono em 2026-10-07).
- **DEC-181..188** são deste plano (dono, 2026-10-14): 181..184 são a revisão das telas
  (D-K..D-N) e 185..188 são as respostas às **quatro ASK** — V6-03 → DEC-185,
  V6-04 → DEC-186, V6-05 → DEC-187, V6-06 → DEC-188. A **DEC-180 foi tomada pelo
  plan-v5** no mesmo dia (V5-fix-2, "Gerar DOCX"), por isso a revisão nasceu em 181..184
  e não em 180..183.
- **Nenhuma ASK aberta:** o plano não executa onda com pergunta em aberto — a tabela da
  SPEC §12 é registro histórico do que foi perguntado e decidido.
- **Próxima livre: DEC-190** (DEC-189 é do plan-v4, lote SUB-1 de 2026-10-15). Antes de
  abrir DEC nova, `grep` os **cinco** `STATE.json`
  (clean-arch, plan-v3, plan-v4, plan-v5, plan-v6) — a numeração é global e já tem buraco.
- `ASK-V6-NN` para perguntas ao dono; `GAP-V6-NN` para lacunas abertas.

## 9. Como executar

```bash
# 1. ver a onda atual
grep -n '"activeBatch"' displayquest-v2/plan-v6/STATE.json

# 2. implementar a onda (agente build)
/ui-refactor <alvo-da-onda>

# 3. gate de qualidade visual (agente ui-reviewer, read-only)
/ui-review <alvo-da-onda>

# 4. gates técnicos
npm run arch:check && npm run lint && npx tsc --noEmit && npx vitest run

# 5. greps de contrato da redistribuição (ondas V6-1/V6-2/V6-4/V6-8/V6-9)
grep -rn "loja/gerenciar" app components lib          # 0 depois de V6-8
grep -rn "DASHBOARD_PROJETOS" .                        # 0 depois de V6-2
grep -c "MANAGE_REWARDS" backend/domain/identity/permissions.ts   # 1 depois de V6-8
grep -rn "showDashboard" app components                # 0 depois de V6-4 (DEC-186)
grep -rn "Sistema de Gerenciamento de Tarefas" app     # 0 depois de V6-11 (DEC-188)

# 6. gravar o estado
#    displayquest-v2/plan-v6/STATE.json  -> waves[i].status, updatedAt, gates
```

## 10. Entregáveis

1. `SPEC.md` — contrato de comportamento (feito, aguarda aprovação do dono).
2. `PLAN.md` — este arquivo (ordem + gates).
3. `STATE.json` — progresso por onda.
4. Skill `displayquest-ui` com dark mode documentado, sem ilustração e citando as **5**
   imagens (V6-0).
5. Shell com sidebar + telas todas na linguagem das referências (V6-2..V6-10).
6. **Redistribuição:** Relatórios com 3 abas + assistente (V6-6b), Voluntários no Admin
   (V6-9), detalhe do projeto em 5 abas (V6-5), rota morta removida (V6-8), guarda de
   servidor no admin (V6-9) e chaves de permissão sem duplicata/morta (V6-2/V6-8).
7. Greps finais em zero + G5/G6 verdes (V6-11).
