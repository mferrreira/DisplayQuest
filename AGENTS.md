# AGENTS.md

Notas de trabalho para agentes neste repositório. Criado em 2026-08-29 durante a
mitigação de segurança A1–A11 (spec em `.spec/`).

## Verificação

- **Gate de entrega:** `npm run arch:check` (exit 0, allow-list **vazia**) && `npm run lint` (nada de erro) && `npx tsc --noEmit` (0) && `npx vitest run` (baseline atual: **64 arquivos / 721 testes, zero failure** — a contagem só cresce desde o B8, que removeu os 651 testes de paridade; ver seção clean-arch).
- **G4/integração:** roundtrips Prisma real rodam **só** contra o banco de teste isolado `dq-dev-test-db` em `127.0.0.1:5433` (`$env:DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"; npx vitest run`) — nunca contra o `display-quest-db` (5432, produção local).
- **Setup do G4 (corrigido 2026-10-02):** `npm run db:test:up` e `npm run db:test:setup` **existem**
  no `package.json` e fazem a sequência completa (`docker compose -f docker-compose.test.yml up -d`,
  `prisma migrate deploy` na 5433, `db:seed` e `tests/fixtures/g4-normalize.sql`). Uma nota anterior
  aqui afirmava que não existiam — está superada. O passo do `g4-normalize.sql` continua
  indispensável: sem ele, `entities-roundtrip` falha porque o seed escreve status pré-contrato e o
  schema estrito os rejeita por design (D-18). `db:test:guard` **não** existe e não foi inventado.
- **Node local ≠ Node de deploy:** a imagem é `node:20-alpine`; o `engines` não é declarado e
  não há `.nvmrc`. Gate verde local não implica gate verde no deploy quando o Node difere —
  foi assim que o shim `path` (removido) quebrava em Node 22+ e passaria em Node 20.
- **Secrets:** `npm run check:env` valida `NEXTAUTH_SECRET` (≥32, sem placeholder) e
  senha do banco (denylist). O runner lê `process.env`, não `.env` — exporte as variáveis.

## Arquitetura clean-arch (refatoração 2026-09/10, ondas 0–9)

- **Árvore:** `backend/domain/` (core puro: erros tipados + regras como funções puras,
  `now` sempre parâmetro), `backend/models/` (record builders puros, **zero**
  `@prisma/client`), `backend/modules/<m>/{application/{contracts,ports,use-cases},infrastructure/{repositories,adapters}}`, `backend/composition/root.ts` (único ponto de wiring cruzado; expõe `checkDatabaseHealth`). Ver `backend/README.md`.
- **Gate G0:** `npm run arch:check` (dependency-cruiser, RG-01..RG-06) com **allow-list
  vazia** desde OND9-B1 — import proibido novo quebra o gate. Não re-adicionar entradas
  sem decisão registrada em `displayquest-v2/clean-arch/STATE.json`.
- **Rotas:** finas, via `getBackendComposition()`; erros de domínio mapeados por
  `lib/api/domain-error-response.ts` (`domainErrorResponse`: Validation→400, NotFound→404,
  Conflict→409, Forbidden→403); não-DomainError (enum Prisma, FK P2003) segue no 500 legado.
- **Quirks são contrato:** os quirks congelados seguem pinados pelos testes da wiring nova
  (roundtrips G4, `use-cases.*`, `*-rules`, goldens novos). A suíte de paridade
  antigo-vs-novo e os gateways legados em `infrastructure/*.gateway.ts` foram **removidos
  no OND9-B1 (repo-cleanup B8, 2026-10-01, DEC-26/DEC-29)** — o comportamento antigo está
  preservado no git (tag `pre-cleanup` = `12d9d6c`).
- **Composição:** factories aceitam `repository?`/`ports?` (seam primário); publishers
  entre módulos entram por porta local injetada no composition root (DEC-21).
- **Estado/decisões:** `displayquest-v2/clean-arch/{PLAN.md,STATE.json}` — STATE.json v2.0.0
  agora monitora o **repo-cleanup** (lotes B0–B11, iniciado 2026-10-01). O histórico da
  refatoração clean-arch (ondas 0–9, 41 batches, AC-00-01..15, DEC-01..DEC-25) está no git
  (tag `pre-cleanup` = `12d9d6c`); o registro DEC-01..28 e os GAPs foram carregados no
  STATE.json v2 (`decisionRegistry`/`gapRegistry`) — comentários de código que citam
  `DEC-NN` continuam resolvíveis.

## Perfil do sistema (2026-09-05)

- **Papéis e permissões:** `ADMIN`/`COORDENADOR`/`LABORATORISTA` com `MANAGE_WORK_SESSIONS` gerenciam sessões alheias; `MANAGE_USERS` gerencia grade de horários. Voluntário e demais têm leitura liberada onde faz sentido.
- **Kanban:** tema escuro com colunas em cores sólidas por estado (sem degradê), contraste verificado — perfil visual do board é escuro/sólido.
- **Notificações:** painel em popover; fecha ao clicar fora e com `Escape`, acessível por teclado.
- **Grade de horários:** leitura aberta (qualquer autenticado vê todos os horários); escrita/bulk restrita a `MANAGE_USERS`.
- **Sessões de trabalho:** gestor (`MANAGE_WORK_SESSIONS`) vê ativas+pausadas de todos e pode pausar/retomar/finalizar/excluir; usuário comum opera só as próprias. Anti-farm: teto de 9h por trecho ativo e varredura noturna 23:59 (America/Sao_Paulo) fecha o que ficou aberto overnight/weekend.
- **Infra e persistência:** Postgres exposto só intra-rede no compose base; `docker-compose.override.yml` (versionado) adiciona `127.0.0.1:5432` loopback para `psql`/vitest. Volumes de `uploads`/`reports`/`postgres_data` persistem entre `--build`/`--force-recreate`.

## Gotchas reais (verificados empiricamente)

- **npm NÃO injeta `NODE_ENV`** em run-scripts. `NODE_ENV=${NODE_ENV:-development}` em
  prefixo é o mecanismo de default-dev; onde não existe, o código checa por conta própria.
- **Seed (A6):** `npx tsx prisma/seed.ts` com `export *` ou import estático de side-effect
  pode **lazy-skip** a dependência (corpo do entry roda, o seed não — provável causa do
  seed nunca ter rodado via script). `import()` dinâmico comum perde o event loop (dev sai
  silencioso). Solução: `assertSeedAllowed()` na primeira instrução e
  `createRequire(import.meta.url)("./seed.dev")` (determinístico sob tsx).
- **CLI (A10):** `cli/guard.js` é função pura; `cli/index.js` decide com `--allow-prod`.
  Em produção sem flag → exit 1 antes de conectar no banco.
- **Vitest e node builtins:** mockar `node:fs/promises` via `vi.mock` **não intermedeia**
  de forma confiável (a rota ainda via o `readFile` real). Padrão da casa: rotas leem via
  um seam em `lib/` (ex.: `readReportFileBytes` em `lib/storage/report-uploads.ts`) e o
   teste mocka a lib, não o builtin.
- **`floating-session-timer` — gotcha CONFIRMADO nesta base (2026-10-01):** o arquivo
  `tests/unit/components/floating-session-timer.test.tsx` existe e está na baseline (5 testes,
  verdes). O auto-pause chama `ResponsibilitiesAPI.pause()` **depois** de `pauseSession()`;
  sem mock, essa chamada vai pro MSW, fica **pendente**, e a linha seguinte
  (`setShowAutoPauseDialog(true)`) nunca executa dentro do `act()` — o sintoma é `pauseSession`
  tendo sido chamado corretamente e mesmo assim o dialog "Sessão pausada automaticamente"
  ausente. Fix (validado): `vi.mock("@/contexts/api-client")` expondo `ResponsibilitiesAPI`
  com `pause`/`resume`/`getActive` resolvidos. Uma versão anterior deste arquivo afirmava que
  o teste "não existe nesta base" — está errado, não siga.
- **LSP engana:** `Cannot find module` para `.js`/libs recém-criadas é falso-positivo do
  LSP; `tsc --noEmit` e `vitest` passam (`allowJs: true`, `moduleResolution: bundler`).
- **Uploads (A11):** relatórios em `data/uploads/reports` (privado, servido só por
  `/api/report-files/[...path]`, regra de acesso = `getProjectReport`). Avatares continuam
  em `public/uploads/avatars` e são servidos por `/api/uploads/avatars/...`. Avatar aceito:
  `null`/`""` ou prefixos `/uploads/avatars/` (legado) e `/api/uploads/avatars/` (runtime).
- **Writability do container (crítico):** o app roda como `USER nextjs` (uid 1001). O Dockerfile
  faz `chown nextjs:nogroup` **apenas** em `/app/public/uploads` (avatares) e `/app/data/uploads`
  (relatórios) — todo o resto de `/app` é root e não-gravável. Montar/criar caminhos de upload
  fora desses dois volta a quebrar com **EACCES**; qualquer novo caminho de escrita precisa de
  `mkdir -p` + `chown` no Dockerfile.
- **Infra (hardening 2026-09-05):** `docker-compose.yml` base do `postgres` usa `expose: ["5432"]` (só intra-rede `app -> postgres:5432`), sem `ports` no host — `ss -tlnp | grep 5432` vazio em prod. `docker-compose.override.yml` (versionado) adiciona `127.0.0.1:5432:5432` para `localhost:5432` local (`psql`, vitest roundtrip) e também em prod (loopback, não `0.0.0.0`). Debug remoto: `ssh -L 5432:localhost:5432 <host>` ou `docker compose exec postgres psql`. `healthcheck` usa `$${POSTGRES_USER:-...}` (não hardcoded). Volumes `uploads_data`/`report_files_data`/`postgres_data` persistem entre `--build`/`--force-recreate` (containerd snapshotter: checar dentro do container, não no host). Sem `POSTGRES_PASSWORD`/`NEXTAUTH_SECRET`, `compose up` falha com `${VAR:?}`.
- **Radix UI em jsdom:** os triggers de `Select`/`Dialog`/`DropdownMenu` chamam
  `hasPointerCapture` (Pointer Capture API), `scrollIntoView` e `ResizeObserver` — nenhum existe no
  jsdom. Sem os shims, o Select não abre **silenciosamente** (exceção unhandled num effect,
  `aria-expanded` fica `false`) e o teste só falha ao buscar os `role="option"`. Shims vivem em
  `tests/setup.ts` (guardados por `typeof Element !== "undefined"` — as suítes com
  `// @vitest-environment node` pulam). Não remover (2026-09-03).
- **Roundtrip de integração precisa de banco no ar:** os roundtrips G4 do clean-arch
  (`tests/integration/*-roundtrip.test.ts`, environment `node`) rodam Prisma real contra
  o banco de teste **isolado** `dq-dev-test-db` em `127.0.0.1:5433` (exportar
  `DATABASE_URL` apontando para a 5433). Com o container parado, a suíte falha com
  "Can't reach database server"; re-arme com `docker start dq-dev-test-db` (NUNCA tocar
  no `display-quest-db`/`display-quest`). O roundtrip antigo `tests/integration/entities-roundtrip.test.ts`
  usa `localhost:5432` via `docker compose up -d postgres` (nome do serviço = `postgres`,
  container = `display-quest-db`) — `db` **não** é o nome do serviço.
- **Nunca imprimir/commitar o valor real do `NEXTAUTH_SECRET`** do `.env` local.
- `tests/` é versionado por negações no `.gitignore` (`tests/*` + `!tests/unit`,
  `!tests/integration/**` etc.; screenshots de e2e continuam ignorados) — os testes
  fazem parte do commit desde `7155b92`.
- **Lint em git worktree falha (config-cascade):** o app é desenvolvido em worktrees em
  `.worktrees/`. Como worktree é dir aninhado, o ESLint conflita config-cascade
  (`.eslintrc.json` local vs `../../.eslintrc.json` do repo pai, exit ≠ 0 só em worktree).
  No repo pai `npm run lint` passa (exit 0, só warnings). **Workaround validado:** validar
  sempre com `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` (exit 0 limpo).
- **Enviar env para vitest em worktree:** o runner lê `process.env`, não `.env`, e o `.env`
  tem aspas nos valores. Exportar com `set -a; source .env; set +a; npx vitest run` (o
  `grep/cut` sem aspas também funciona).

## Documentação (docs/)

- **Dois documentos, ambos gerados** (nenhum editado à mão): `docs/displayquest.html` (técnico:
  `docs/src/*.md` + `docs/diagrams/*.puml`, 15 capítulos / 33 figuras UML, ~1 MB) e
  `docs/guia-do-usuario.html` (guia de uso: `docs/src-usuario/*.md` + `docs/screens/*.png`,
  12 capítulos / 34 capturas, ~8 MB). Compartilham `docs/theme/document.css`. `npm run docs:build`
  renderiza os SVGs (PlantUML em Docker — requer Docker no ar) e monta os dois; `--only=tecnico`
  ou `--only=usuario` monta um só; `--no-render` reaproveita os SVGs. `npm run docs:check` valida
  os caracteres das fontes (agora também `docs/src-usuario`). Abra por `file://`, sem servidor.
- **O guia é o modo "como fazer":** cada seção parte de um objetivo e nomeia controles pelo rótulo
  que a interface mostra. Arquitetura, modelo de dados, derivação de regra e API ficam no documento
  técnico — não duplique no guia.
- **Capturas:** `node scripts/capture-user-guide.mjs` percorre a instância em execução, verifica que
  a tela certa foi alcançada (URL + textos esperados) e extrai do DOM títulos/botões/abas/colunas/
  links em `docs/.build/screens/manifest.json`. **Esse extrato é a fonte do texto do guia** — o guia
  descreve a interface medida, não o código lido. PNGs vão para `docs/screens/` (**versionado**);
  credenciais em `docs/.capture.env` (gitignored). **Algumas capturas gravam de verdade** (ex.:
  *Gerar em Lote* criou 9 relatórios semanais na instância real): confira a lista `INTERACTIONS`
  antes de rodar contra dados reais.
- **Bloco de captura:** ```foto <id> titulo="…"``` embute `docs/screens/<id>.png` como data URI.
  Uma captura referenciada duas vezes derruba o build, igual ao `figure`.
- **O build é um gate duro:** falha se um `.puml` não renderizar, se um bloco cercado ficar sem
  fechamento (bug real já ocorrido: sem o ``` final, o capítulo inteiro era absorvido como
  legenda da figura e nada denunciava), se um diagrama for referenciado duas vezes, ou se dois
  capítulos tiverem o mesmo título. Depois de mexer em `docs/src` ou `docs/diagrams`, rode o
  build — e confira se nenhum aviso `AVISO:` apareceu.
- **O que é versionado:** `docs/displayquest.html`, `docs/guia-do-usuario.html` e `docs/screens/`
  (as capturas são fonte do guia). `docs/.build/` (SVGs re-renderizados e o extrato do DOM) está no
  `.gitignore`, junto de `docs/.capture.env`.
- **Diagramas: uma referência por arquivo.** `docs/diagrams/<id>.puml` é consumido por um único
  bloco ```figure <id> titulo="…"```; referenciar duas vezes derruba o build. Para citar uma
  figura já usada, escreva no texto ("a figura da implantação, no capítulo 10") — não repita o
  bloco. O bloco aceita um corpo markdown livre, que sai como legenda abaixo da figura.
- **Callouts:** `::: nota|atencao|limite|legado titulo="…"` … `:::` (fechamento obrigatório).
- **Os `.md` antigos (`docs/01..08`, `docs/APOO/`) foram removidos** em 2026-10-02, arquivados
  pelo git; o conteúdo foi reescrito em `docs/src`. Não os recrie.
- **Ruído de caracteres:** o gerador de texto às vezes insere caracteres não latinos
  ("树叶", "拒绝了", "分明") na prosa. `npm run docs:check` pega os não latinos; os puramente
  ASCII (ex.: "Family", "Consulting", "efeitocolateral", "etimau") só aparecem na releitura —
  sempre releia o que escreveu.
- **Quirks do PlantUML desta versão:** (a) `usecase` dentro de `package`/`rectangle` não aceita
  aresta vinda de `class` — use `class … <<casoDeUso>>` no diagrama de requisitos;
  (b) linha começando `|palavra|` (activity bar) dentro de `if` aninhado quebra o parser;
  (c) o token `Next` no início/fim de rótulo de activity quebra o parser.

## Defeitos de interface medidos na instância (2026-10-02)

Coletados pelo extrato do DOM da captura do guia (`docs/.build/screens/manifest.json`) e por
leitura do texto visível. São observações medidas na instância real, **não** diagnosticados:

- **`<title>` genérico em todas as telas:** "Sistema de Gerenciamento de Tarefas" (medido nas 11
  rotas, inclusive `/login`). A aba do navegador nunca diz DisplayQuest.
- **Strings sem acento, entregues assim na interface:** "Quadro de Lideranca", "Classificacao
  completa", colunas "Posicao" / "Usuario" / "Tarefas concluidas" (ranking); "Abrir controle de
  sessao" (perfil); "Meus Premios" (menu do cabeçalho); "admin (sem horario)" e afins (grade do
  laboratório).
- **Vazamento de enum no detalhe da tarefa:** o diálogo mostra "PRIORIDADE High" e "STATUS to-do"
  em vez de "Alta" e "A Fazer".
- **Prazo renderizado quebrado no detalhe da tarefa:** "PRAZO 21T12:00:00.000Z/01/2025".
- **Penalidade de atraso explode o valor:** "PONTOS 60 pts(agora: -37140 pts com penalidade)" numa
  tarefa vencida de 2025. O cálculo de `calculateLatePenalty` não tem piso.
- **`/login` e `/register` não têm nenhum heading** (0 `h1`/`h2`/`h3` no DOM): o título é
  `CardTitle`, que renderiza `div`. Sem ponto de ancoragem para leitor de tela.
- **Navegação do cabeçalho é inconsistente entre papéis:** grupo com vários destinos visíveis vira
  acordeão fechado (o coordenador vê só os rótulos, nenhum destino); grupo com um único destino
  visível é achatado em link direto (o pesquisador vê "Laboratório" como link). O mesmo cabeçalho
  se apresenta de duas formas.
- **Dados de lixo na instância real:** tarefas "rewqr" e "asfsa", projeto "asdfasdf" — aparecem no
  quadro e nas capturas.
