# plan-v6 — refatoração visual UI/UX (linguagem DisplayQuest)

> Demanda do dono em 2026-10-06/07: evoluir a interface existente para a linguagem
> visual das referências da skill `displayquest-ui`, **sem reconstruir**, preservando
> implementação, dados e comportamento sempre que possível. As ilustrações/texto
> manuscrito **ficaram de fora** (DEC-109) e o **tema escuro passa a ser coberto** na
> skill (DEC-110). Escopo: **todas as telas nesta rodada** (DEC-108).
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

Tudo abaixo está **medido no repo em 2026-10-06/07** e documentado com evidência na
`SPEC.md §2`. Resumo das dores que este plano ataca:

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
| Detalhe do projeto: `Dialog` de 90vh com scroll duplo e **9 Cards** | **7 ocorrências de porta** de permissão em **7 linhas** (5 expressões) |
| `ModernAdminPanel` (**1165 linhas**) sem teste nenhum | coberto só por `tsc` |

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

> **Próxima decisão livre: DEC-115.** Antes de abrir DEC nova, `grep` os `STATE.json`
> (regra global da casa).

## 3. Ondas (ordem obrigatória)

Cada onda = **um commit revertível**, com `dc` (done criteria) observáveis e gate.
A SPEC é quem define o *comportamento*; esta tabela define a *ordem* e o *tamanho*.

| # | Onda | Por que nesta posição | DC (done criteria) | Gate da onda |
|---|---|---|---|---|
| **V6-0** | Skill e ferramenta alinhadas | é pré-condição: o `/ui-review` e o `ui-reviewer` guiam **todas** as demais ondas | 3 gaps corrigidos: `SKILL.md` cita as 4 imagens; `ui-reviewer.md:31` deixa de exigir ilustração; `ui-refactor.md` nomeia o gate real | grep de AC-V6-23 + `git diff` só em `.opencode/**` |
| **V6-1** | Tokens + primitivos compartilhados | **pré-condição central** (D-G): sem ela, cada tela recria `PageHeader`/`StatCard` de novo | `PageHeader`, `StatCard`, `EmptyState`, `SearchInput`, `components/ui/status.ts` + 5 testes novos | `vitest run tests/unit/ui` verde; `arch:check` |
| **V6-2** | Shell: sidebar desktop + header compacto | antes das telas, para que elas nasçam dentro do layout novo | sidebar usa `nav-config`; nav sem `rounded-full`; `<header>` mantido; menu mobile intacto | `e2e/shell.spec.ts` 5 passando + `app-sidebar.test.tsx` |
| **V6-3** | Home (`/dashboard`) | tela de destino + **a melhor testada** — primeiro teste real da nova linguagem | regiao de cabecalho, resumo só com dado já carregado, **sem coluna secundária** (quadro com largura toda, D-J), colunas sem gradiente/emoji, `PageHeader` | `vitest run features/tasks` verde + `task-board.spec.ts` não piora |
| **V6-4** | Projetos (`/dashboard/projetos`) | usa os primitivos + `status.ts`; **caracterização antes**; após o plan-v5 nesta tela (D-I × `V5-4` wizard) | 1 título; chips com contagem; lista vertical; progresso derivado; `project-list.test.tsx` **antes** | `project-list.test.tsx` verde + grep de AC-V6-14/15/16 |
| **V6-5** | Projeto → rota `/dashboard/projetos/[id]` | depois de Projetos; é a maior mudança estrutural; **após o plan-v5** `V5-2` (D-I) | rota renderiza; as 7 ocorrências de porta idênticas; nenhum conteúdo falta; dialog sai | `project-detail-page.test.tsx` verde (casos por papel) + AC-V6-17/18/19 |
| **V6-6** | Laboratório + Relatórios Semanais | `PageHeader` + tokens; baixo risco | sem paleta cravada/degradê; `PageHeader` | grep da onda + `/ui-review laboratorio` |
| **V6-7** | Perfil + Ranking | juntos (o Ranking é filho do Perfil); **após o plan-v5** `V5-3` (D-I), ordem resolvida | idem V6-6; `h1` único | grep + `/ui-review perfil` |
| **V6-8** | Loja + Loja/Gerenciar | idem | idem | grep + `/ui-review loja` |
| **V6-9** | Admin (`ModernAdminPanel` + arredores) | **última** das telas grandes por ser a de maior risco (**1165** linhas, zero testes) | caracterização **antes**; depois tokens/`PageHeader` | `tests/unit/components/admin` verde antes do commit de UI |
| **V6-10** | Login + Register | isolada, sem dependência de shell | ganham `<h1>`; sem paleta cravada | grep + `/ui-review login` |
| **V6-11** | Fechamento: G5/G6 + greps finais + dívida | só depois de todas as telas | greps de AC-V6-01..06 em **zero**; `docs:build`+`docs:check`; capturas recapturadas; `STATE.json` `done` | **G0–G6 inteiros** + relatório final |

### 3.1 Regras de avanço

1. **Ordem obrigatória** — `V6-N` só começa com `V6-(N-1)` `done`.
2. **Primitivos antes das telas** (V6-1 antes de V6-3+) — regra D-G; se uma tela
   precisar de um primitivo que não existe, **volta em V6-1**, não cria local.
3. **Caracterização antes de mexer** — `ProjectList`, `ProjectDetailDialog`,
   `nav-config`, `AppHeader`, `MobileMenu`, `ModernAdminPanel` têm **zero testes hoje**;
   em `V6-4`, `V6-5`, `V6-2` e `V6-9` o teste vem **num commit anterior** ao da UI.
4. **Um `/ui-review` por alvo** antes de dar a onda por fechada (Must/Should/Optional).
5. **Nada de dependência nova, nada de rota nova além de `/dashboard/projetos/[id]`.**
6. **Ordem frente ao `plan-v5` — DEC-113 (dono, 2026-10-07):** o backend é a fonte de
   verdade e o front é implementado seguindo o back. Nas colisões o **plan-v5 executa
   antes** (`V6-4` × `V5-4` wizard, `V6-5` × `V5-2` banner/logo, `V6-7` × `V5-3` banner
   de perfil/pódio). `V6-0`..`V6-3` não tocam nada do plan-v5 e podem executar antes.

## 4. Etapas detalhadas (por onda)

### V6-0 — Skill e ferramenta

- `SKILL.md:22-24` → lista `home.png`, `projects.png`, `project.png`, `home-darkmode.png`
  (este como autoridade do dark).
- `references/design-system.md` → superfície/borda/sombra com contraparte dark
  (`:5`, `:19-27`, `:41-47`, `:49-62`, `:93`, `:113-117`).
- `references/visual-language.md` → `:5`, `:13` param de dizer "light"/"pastel" sem
  qualificar tema; `:16-17`, `:28-50`, `:52-62` (ilustração/manuscrito) **saem**.
- `references/anti-patterns.md:50-54` → o parágrafo que manda seguir o estilo desenhado
  **sai**; `:54` vira "sem artwork decorativo".
- `references/layout-patterns.md:135` → "Decorative illustrations…" **sai**.
- `references/components.md:36` → remanescente de ilustração **sai**.
- `.opencode/agents/ui-reviewer.md:31` → prioridade 9 vira "ausência de artwork
  decorativo" (D-E).
- `.opencode/commands/ui-refactor.md:33` → "the relevant checks" vira o gate concreto
  (`arch:check` + `lint` + `tsc --noEmit` + `vitest run`), com baseline.

**DC:** AC-V6-23 verde. **Commit:** só `.opencode/**`.

### V6-1 — Tokens + primitivos

- Novos: `components/ui/page-header.tsx`, `stat-card.tsx`, `empty-state.tsx`,
  `search-input.tsx`, `components/ui/status.ts`.
- `status.ts` concentra o que hoje é `statusColors`/`statusLabels`
  (`project-list.tsx:15`/`:21` e `project-detail-dialog.tsx:73`/`:79`),
  `taskStatusColors` (`project-detail-dialog.tsx:85`) e
  `priorityBadgeClass` (`task-card.tsx:100`) / `statusBadgeClass` (`:113`) /
  `PRIORITY_LABEL` (`:85`) / `STATUS_LABEL` (`:92`).
  Nesta onda as duas cópias de `statusColors` passam a importar de `status.ts` (troca
  mecânica — o dialog inteiro sai em V6-5); as do cartão migram em V6-3.
- Testes: `tests/unit/ui/{page-header,stat-card,empty-state,search-input,status-badges}.test.tsx`.
- **Não** aplicar nas telas ainda (só os primitivos + as trocas mecânicas acima).

**DC:** AC-V6-04/05/06/07 nas linhas de base; 5 arquivos de teste verdes.
**Commit:** `primitivos UI + status.ts`.

### V6-2 — Shell

- `components/layout/app-sidebar.tsx` (novo) + `app-header.tsx` reduzido (identidade,
  sino, tema, avatar) — **`<header>` permanece** (AC-V6-08).
- Item de nav extraído e compartilhado entre sidebar e `mobile-menu.tsx` a partir do
  `nav-config.ts` (sem destino novo, AC-R1 de RF-V6.3).
- Remover `rounded-full` dos itens de navegação (AC-V6-09).
- **Caracterização antes:** `tests/unit/layout/app-sidebar.test.tsx` +
  teste de `nav-config`/`AppHeader`.
- Tokens `--sidebar-*` (já existentes) passam a ser usados — **zero CSS novo**.

**DC:** `shell.spec.ts` 5 passando; `app-sidebar.test.tsx` verde.
**Commit:** `shell: sidebar desktop`.

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

**DC:** AC-V6-14/15/16. **Commit:** `projetos: lista vertical + PageHeader`.

### V6-5 — Projeto → rota

- Novo `app/(dashboard)/dashboard/projetos/[id]/page.tsx` + refactor do conteúdo do
  dialog em seções (sem scroll duplo, sem `h-[90vh]`).
- `projectsApi.getById(id)` + `projectsApi.members(id)` (**1 fetch por rota**, viável
  só aqui) — sem N+1.
- Os 2 pontos de entrada navegam; `ProjectDetailDialog` **sai**.
- **Medir a porta do servidor antes** (DEC-92) antes de escrever o gate das **7
  ocorrências de porta** em **7 linhas** (5 expressões — tabela na `SPEC.md` §2.4).
- Preservar o checklist de **13 blocos** da `SPEC.md` §8.4 (AC-V6-19).

**DC:** AC-V6-17/18/19; `project-detail-page.test.tsx` verde (casos por papel).
**Commit:** `rota /dashboard/projetos/[id]`.

### V6-6..V6-10 — Demais telas

Cada uma: caracterização se não houver → `PageHeader` → tokens no lugar de paleta
cravada/degradê → raio/padding na escala → reaproveitar primitivos.

- **V6-6** Laboratório + Relatórios Semanais.
- **V6-7** Perfil + Ranking (**conferir colisão com plan-v5 `V5-3`**).
- **V6-8** Loja + Loja/Gerenciar.
- **V6-9** Admin — caracterização de `ModernAdminPanel` **antes** (é o maior risco).
- **V6-10** Login + Register — ganham `<h1>` (hoje: zero headings).

**DC de cada:** grep da onda (AC-V6-01/02/04/20) + `/ui-review <tela>` sem Must aberto.

### V6-11 — Fechamento

- Greps finais **globais** do escopo: AC-V6-01..06 em zero (exceto DEC registrada).
- `package.json` intocado (AC-V6-25).
- **G5:** `docs:build` + `docs:check`. **G6:** recapturar as capturas cuja tela mudou.
- `displayquest-v2/README.md` + `AGENTS.md` (seção plan-v6) atualizados.
- `STATE.json` → `status: "done"`.

## 5. Gates (G0–G6)

| Gate | Comando | Baseline (2026-10-07) | Quando |
|---|---|---|---|
| **G0** | `npm run arch:check` | exit 0, allow-list **vazia**, 787 módulos / 3077 deps | toda onda |
| **G1** | `npm run lint` | nenhum erro (worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`) | toda onda |
| **G2** | `npx tsc --noEmit` | 0 erros | toda onda |
| **G3** | `npx vitest run` | **87 arquivos / 1107 testes** (unit+features), zero failure | toda onda |
| **G4** | roundtrips Prisma | **não se aplica** — plano sem backend (rodar só se alguém tocar `prisma/`, que é erro de escopo) | — |
| **G5** | `npm run docs:build && npm run docs:check` | verde | ondas com tela visível |
| **G6** | recapturar `docs/screens/` | — | quando a captura deixa de representar a tela |

**e2e (requer dev server em `:3001`):**
`npx playwright test tests/e2e/shell.spec.ts` → 5 passando;
`npx playwright test tests/e2e/task-board.spec.ts` → 2 passando + **1 falha conhecida**
(cartão a mais na coluna — dado legítimo da instância; confirmar com `git stash`) +
5 "did not run" (spec serial).

## 6. Rollback

- **Um commit por onda** → `git revert <sha>` desfaz a onda inteira sem tocar nas outras.
- `V6-0` é só `.opencode/**` (nenhum gate técnico depende dele).
- `V6-1` adiciona primitivos **sem aplicar** → revert seguro, nenhuma tela muda.
- A mudança mais estrutural (`V6-5`, rota) é auto-contida em
  `app/(dashboard)/dashboard/projetos/[id]/` + remoção do dialog → revert devolve o
  dialog.

## 7. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| Suíte do quadro é sensível a rótulo (`getByLabel` casa por substring) | rótulo novo **não pode conter** o rótulo do elemento que ele governa; `tests/e2e/task-board.spec.ts` e `features/tasks/__tests__/*` a cada mudança no quadro |
| `ModernAdminPanel` sem teste + `async` sem `catch` → `Unhandled Rejection` fecha o gate com exit 1 | caracterização em `V6-9` antes; seguir o padrão `userSettingsError` + `<p role="alert">` |
| `Toaster` do Sonner exige stub local de `matchMedia` | stub **local ao teste**, nunca global em `tests/setup.ts` (derrubaria o caminho "mobile" do quadro) |
| jsdom sem `localStorage`/`window.confirm` | copiar o padrão de `session-notes-draft.test.tsx`; `vi.stubGlobal("confirm", …)` |
| ~~Colisão com `plan-v5`~~ **resolvida (DEC-113)** | ordem fixada: plan-v5 antes em `V6-4`/`V6-5`/`V6-7`; `V6-0`..`V6-3` livres. `plan-v5` segue `ready`, não iniciado |
| Escapar escopo virar "refatoração de comportamento" | RF-V6.10 R1/R2/R3 — `git diff` de `prisma/ backend/ app/api/ contexts/ package.json` tem de ficar vazio |

## 8. Regras de numeração

- **DEC-105..114** são deste plano (§2, inclui D-I/D-J do dono em 2026-10-07). Próxima: **DEC-115**.
- `ASK-V6-NN` para perguntas ao dono; `GAP-V6-NN` para lacunas abertas.
- **Numeração de decisão é global** — antes de abrir DEC nova, `grep` os `STATE.json`
  (`clean-arch`, `plan-v3`, `plan-v4`, `plan-v5`, este).

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

# 5. gravar o estado
#    displayquest-v2/plan-v6/STATE.json  -> waves[i].status, updatedAt, gates
```

## 10. Entregáveis

1. `SPEC.md` — contrato de comportamento (feito, aguarda aprovação do dono).
2. `PLAN.md` — este arquivo (ordem + gates).
3. `STATE.json` — progresso por onda.
4. Skill `displayquest-ui` com dark mode documentado e sem ilustração (V6-0).
5. Shell com sidebar + telas todas na linguagem das referências (V6-2..V6-10).
6. Greps finais em zero + G5/G6 verdes (V6-11).
