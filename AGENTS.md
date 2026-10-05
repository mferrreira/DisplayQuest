# AGENTS.md

Notas de trabalho para agentes neste repositório. Criado em 2026-08-29 durante a
mitigação de segurança A1–A11 (spec em `.spec/`).

## Verificação

- **Gate de entrega:** `npm run arch:check` (exit 0, allow-list **vazia**) && `npm run lint` (nada de erro) && `npx tsc --noEmit` (0) && `npx vitest run` (zero failure). A contagem é **por branch**: no `dev` o baseline era **64 arquivos / 721 testes** quando o B8 removeu os 651 testes de paridade; no `plan/v3-operacional`, medido no encerramento do plan-v3 (2026-10-03), são **65 arquivos / 798 testes** em `tests/unit` + `features` e **75 / 881** na suíte completa. Na `dev` de hoje (2026-10-05, depois do merge do B6-0..B6-2b) são **73 arquivos / 934 testes** e **83 / 1017** na suíte completa. Compare sempre com o `STATE.json` do plano em que você está.
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
- **D4 não são 16 rotas — são 41 (medido 2026-10-05, DEC-50):** se você for mexer na
  autorização, não confie no número antigo. 17 rotas importam `hasPermission`/`hasRole` de
  `@/lib/auth/rbac` e 29 usam `ensurePermission`/`ensureAnyRole`/`ensureSelfOrPermission` de
  `@/lib/auth/api-guard` — as 24 que usam só `ensure*` são **a mesma dívida com outra grafia**,
  porque `ensurePermission` delega no mesmo domínio. As outras 20 rotas já estão no formato
  certo (o domínio lança, a rota só mapeia com `domainErrorResponse`) — são o padrão a seguir.
  Note que a regra **já está no domínio** (`backend/domain/identity`); o que falta é
  *enforcement* no use case, e nenhum dos use cases por trás dessas 41 checa ator.
- **O cron é chamador sem ator de 3 use cases (medido 2026-10-05):**
  `lib/services/cron-service.ts` chama `workExecution.listWorkSessions`,
  `labOperations.pauseResponsibilityForUser` e `reporting.resetWeeklyHoursHistory` — todos sem
  ator, porque é rotina de sistema (varredura de anti-farm, reset semanal). Mover a checagem
  para dentro desses use cases sem desenhar o caminho de ator-de-sistema **quebra o cron**.
  E `work-execution` é o único módulo sem factory: instancia use case *inline por chamada*
  (`GatewayCall`), então a migração nele custa mais que nos outros seis.
- **`POST /api/purchases` só barra compra PARA TERCEIRO (medido 2026-10-05):** a regra da rota
  é `!canManagePurchases && targetUserId !== actor.id`, então um VOLUNTARIO comprando para si
  recebe 201 e só quem compra para outro recebe 403. Eu acreditava o contrário e o teste de
  caraterização refutou — em autorização, escreva o teste antes de mover o gate.
- **Estado/decisões (plan-v3):** `displayquest-v2/plan-v3/{PLAN.md,STATE.json}` — STATE.json
  v3.0.0 monitora o plano operacional **plan-v3** (ondas 0–4, 13 batches, AC-P3-01..10,
  DEC-30..DEC-49, GAP-P3-01..04 fechados, GAP-P3-05 aberto, `blockers` vazio). A numeração de
  decisões **continua** a do clean-arch: DEC-01..29 são do clean-arch, DEC-30 em diante são do
  plan-v3. Não reinicie a numeração em outro plano.

## plan-v3 — qualidade operacional (sessões, quadro, pontos)

- **Estado atual:** `done` — **encerrado em 2026-10-03**. Ondas 0–4 fechadas (S0.1, 1.A–1.D,
  2.A–2.C, 3.A–3.C, 4.A–4.B; último commit de código `dbd067e`), G0–G4 verdes e e2e do quadro
  7/7. A **Onda 5 foi removida do plano** (DEC-49, respondendo `ASK-P3-03`): o sinal de pausa
  aceito em HTTP é o da Onda 2 (visual sempre visível + som opcional). `awaitingInstruction`
  está vazia; as perguntas respondidas ficam em `answeredInstructions` e o que saiu do plano em
  `removedItems`.
- **Duas coisas seguem abertas de propósito:** `GAP-P3-05` — o toast da conclusão direta ainda
  anuncia o número *projetado* (`features/tasks/components/task-card.tsx:256`) em vez do
  creditado pela resposta; corrigir move o aviso para depois da mutação. E o seam
  `lib/notifications/browser-notifications.ts` (134 linhas + teste), que ficou **órfão** com a
  F1b fora do escopo: `grep` mostra zero chamadores. Manter ou apagar é decisão do dono
  (registrada em `PLAN.md` §8).
- **Decisões que mudam o desenho:** premiação **pode ficar negativa** (DEC-39, sem piso — o
  `-37140 pts` medido numa captura é a regra funcionando, não bug isolado); nenhum `UPDATE` em
  `tasks.points` histórico (DEC-40); `@pontos` do backlog aceito e ignorado (DEC-41); a ordenação
  por coluna ordena por `id` e pelo valor **gravado** em `points`, porque a tarefa não volta com
  `createdAt` e a coluna é histórica (DEC-47).
- **Restrições duras medidas** (detalhe em `PLAN.md` §2): a instância é **HTTP em IP de rede**,
  e Chrome/Firefox **recusam pedido de permissão de notificação fora de secure context** —
  notificação nativa não é possível lá hoje. A aritmética de atraso existe em dois lugares com
  duas matemáticas diferentes (`backend/domain/task/task-rules.ts` vs
  `features/tasks/utils/move-rules.ts`). O quirk "penalidade pode exceder os pontos" está
  congelado por teste explícito. O delta de pontos **não chega ao cliente**.
- **Gates do plano:** G0–G4 idênticos aos do clean-arch, mais **G5** (`docs:build` +
  `docs:check` em batch que muda comportamento visível) e **G6** (recapturar as telas do guia
  quando a captura deixa de representar a tela).

## plan-v4 — subtasks, animação de pontos, inativação de usuário (2026-10-05)

- **Estado/decisões:** `displayquest-v2/plan-v4/{PLAN.md,STATE.json}` — V4-1 **done**, V4-2..V4-5
  pendentes, `awaitingInstruction` apontando para **D-D** (escopo da subtask na v1). A numeração de
  decisões continua: DEC-55..59 são do plan-v4.
- **Excluir usuário não é o caminho (DEC-55):** `inactive` já funciona de ponta a ponta — login
  (`lib/auth/config.ts:30`), API (`lib/auth/server-auth.ts:36`), regras de laboratório, bulk weekly
  reports, cron weekly reset, e "Inativo" na UI. Nenhuma tela `.tsx` chamava `deleteUser`. O
  `DELETE /api/users/[id]` agora **recusa com 409** quando há dependência; sem dependência continua
  excluindo (é o caso "cadastro de teste").
- **16 das 23 FKs para `users` são `RESTRICT`** (default do Prisma, sem `onDelete`); só 7
  cascadeiam (`project_members`, `task_assignees`, `task_user_progress`, `work_sessions`,
  `weekly_hours_history`, `user_badges.userId`, `notifications`). Se você mexer no schema e
  adicionar uma FK para `users` **sem** `onDelete`, o guarda
  `tests/unit/modules/user-management/user-delete-schema-drift.test.ts` falha e nomeia a coluna —
  ele compara o schema com o corpo de `countBlockingDependencies`, porque o `tsc` não protege
  contra tabela esquecida.
- **Gotcha do guarda:** a forma abreviada `{ userId }` do Prisma não é reconhecível como coluna por
  leitura de texto — o repositório escreve `userId: userId` por extenso de propósito. E ao parsear
  o schema, o nome do modelo precisa sair **sem** a chave (`tasks {` → `tasks`).
- **`translate` × `transform` no Tailwind v4 (medido no CSS compilado da instância, 2026-10-05):**
  `-translate-x-1/2` escreve a propriedade **`translate`**; o `animate-in`/`slide-in-from-*` do
  `tw-animate-css` anima **`transform`** (`@keyframes enter`). São propriedades diferentes e
  **compõem**. O comentário que estava em `components/ui/points-delta.tsx` — "as variantes com
  transform sobrescrevem o `-translate-x-1/2`" — era verdade no Tailwind v3 com
  `tailwindcss-animate` e **não vale mais nesta base**: o movimento em Y do chip entrou no mesmo
  elemento. Valor do percurso: `POINTS_DELTA_SHIFT_PX` em `lib/points-delta.ts`.
- **Utilitário de animação com comprimento:** `slide-in-from-bottom-*` aceita comprimento
  arbitrário (`--value(--translate-*,[percentage],[length])`), mas o ramo de escala só aceita
  **inteiro** — `slide-in-from-bottom-2.5` não funciona; `slide-in-from-bottom-[10px]` funciona.
- **O chip do prêmio tem prazo de 1,9 s.** Em teste de navegador, as asserções do chip vêm **antes**
  das asserções de coluna (orçamento de 15 s), senão o chip já expirou e o locator não acha nada.
  E a contagem do total se prova com um `MutationObserver` instalado **antes** da ação — poll do
  Playwright chega depois do segundo em que a animação acontece.
- **A API de pontos não expressa total negativo** (`add` chao em 0, `remove` exige suficiencia,
  `set` rejeita negativo — os três congelados por teste), mas a premiação produz totais negativos
  (DEC-39; medido: Coordenador em −20, Gerente em −31030). Consequência: um administrador não
  consegue ajustar um usuário de volta a um valor negativo. Registrado como `ASK-V4-05` em
  `displayquest-v2/plan-v4/PLAN.md` §5.2.

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
- **Nem todo use case do D4 tem uma pessoa atrás dele (medido 2026-10-05, B6-2b / DEC-54):**
  4 dos use cases que recebem gate são chamados **por uma rota e por rotinas derivadas ao mesmo
  tempo** — `publishEvent` (rota + `NotificationsLabPublisher` ×2 + `NotificationsReportPublisher`
  + os 3 use cases de `task-management`) e `listWorkSessions` / `pauseResponsibilityForUser` /
  `resetWeeklyHoursHistory` (rota + `lib/services/cron-service.ts`). Colocar o gate dentro do use
  case quebrava a notificação de issue do laboratório, a de relatório enviado e os 3 eventos de
  revisão de tarefa, e **o sintoma não aparece em teste de rota nenhum** — só em produção. Resolvido
  com `ActorRef` (`backend/domain/identity/actor-ref.ts`): `userActor(roles)` na rota,
  `systemActor(reason)` nas rotinas, e `requireActorPermission` decide. Medi isso pela 4ª vez e a
  família do `task-management` eu tinha classificado antes como "no-op, fora do raio": o *default*
  do port é no-op, mas o composition root injeta o **módulo real**
  (`backend/composition/root.ts:39`) — leia o *wiring*, não só a assinatura do port. O `reason` do
  `systemActor` é rótulo de auditoria, não regra: `tests/unit/domain/identity/system-actor.test.ts`
  fixa isso e faz **grep** de `systemActor(` em `app/api/**` para falhar o build se uma rota
  declarar ator de sistema.
- **Gate que não pode descer sozinho porque a rota valida com mensagens próprias (medido
  2026-10-05, B6-2b):** `POST /api/notifications` tem 400s de rota cujas mensagens são
  **diferentes** das congeladas no use case (`"Título e mensagem são obrigatórios"` na rota vs
  `"Título é obrigatório"` no use case). As validações não podem descer junto com o gate, e sem uma
  checagem **antes do parse** o 403 passaria a vir depois delas — quem não tem permissão com corpo
  inválido levaria 400. Daí `AssertCanPublishNotificationEventUseCase`: a rota autoriza antes de ler
  o corpo, e `publishEvent` recheca no próprio `actor` para proteger os demais chamadores. O par
  403-antes-de-400 foi **medido antes** de mexer e não estava fixado em teste nenhum.
- **Gate de autorização + teste de rota: o duplo de MÓDULO não decide nada (medido 2026-10-05,
  B6-2a).** Quando o `ensurePermission` da rota desce para o use case, um
  `vi.mock("@/backend/composition/root")` que devolve `{ store: { createReward: fake } }` faz o
  403 **sumir do teste** — não falhar, sumir, porque a rota não decide mais e o duplo também não.
  O que fazer: montar o **módulo real** sobre portas falsas
  (`createStoreModule({ ports: { rewards, purchases } })`) dentro do factory do mock, que é
  lazy. Dois avisos medidos no mesmo lote: (a) `createStoreModule`/`createGamificationModule`
  constroem **todos** os use cases do módulo, então todas as portas precisam existir — use um
  duplo que lança `"porta X não deveria ser usada"` para as não exercitadas, para o erro ser
  alto em vez de silencioso; (b) `requireApiActor` normaliza com `normalizeRoles`, então
  `login("COORDENADOR")` (string) vira `[]` e **nega todo mundo** — sempre `login(["COORDENADOR"])`.
  E o reverso do mesmo risco: um duplo pode fixar o **comportamento do substituto** em vez do
  do sistema. O B6-0 afirmava `POST /api/rewards {name:"R"}` → 201; a produção devolvia 400
  (`normalizeRewardCreate`) antes e depois. Antes de confiar num status fixado por duplo, confira
  o que o caminho real faz com aquele payload.
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
- **jsdom desta base não tem `window.localStorage` (medido 2026-10-02):** no ambiente jsdom do
  Vitest, `window === globalThis` e `typeof window.localStorage === "undefined"` — o
  `populateGlobal` **não** copia a Web Storage do jsdom (que existe e funciona em
  `globalThis.jsdom.window.localStorage`). Teste de componente que dependa de `localStorage`
  precisa instalar o seu: `Object.defineProperty(window, "localStorage", { configurable: true,
  value: <Map em memória> })` no `beforeEach` e `delete window.localStorage` no `afterEach`
  (o `delete` é o que devolve o ambiente ao estado medido). Referência:
  `tests/unit/components/session-notes-draft.test.tsx` e `floating-session-timer.test.tsx`.
  Consequência boa: o seam `lib/client-storage.ts` cai no caminho "sem storage" durante o teste,
  que é exatamente o comportamento de SSR.
- **O botão collapsed do cronômetro tem 4 rótulos (medido 2026-10-03, 2.C):** o `aria-label` passou
  a anunciar o estado (`sessionTimerButtonLabel` em `components/ui/session-alert.tsx`), então
  `getByLabelText("Abrir timer de sessão")` só acha o caso "sem sessão". Foi o que quebrou
  `features/laboratorio/__tests__/floating-timer-tabs.test.tsx` (2 dos 5 casos abrem o painel
  com sessão aberta) — ele agora busca por fragmento `/abrir timer de sessão/i`.
- **`Dialog` modal esconde o resto da página (medido 2026-10-03):** com o diálogo de pausa
  automática aberto, o botão collapsed cai em `aria-hidden` e `getByRole`/`getByLabelText` não o
  encontram. Nesse estado use `getByTestId("floating-session-timer-collapsed")` e `toHaveAttribute`.
- **`getByLabel` casa por substring (medido 2026-10-03, 3.C):** um `aria-label` de controle não
  pode **conter** o `aria-label` do elemento que ele governa. O botão de ordenação da coluna foi
  escrito como `Ordenar coluna A Fazer` e passou a casar com o `aria-label="Coluna A Fazer"` da
  própria coluna: `page.getByLabel("Coluna A Fazer")` do Playwright devolvia dois elementos e a
  suíte e2e do quadro parou no primeiro teste (`getByLabelText` do Testing Library segue o mesmo
  caminho por padrão). O rótulo virou `Ordenar tarefas de A Fazer`. Quando um controle novo
  governa um elemento que já tem rótulo, **confira que os dois textos não se sobrepõem** — ou
  passe `{ exact: true }`.
- **A suíte e2e estava quebrada antes do 3.A (medido 2026-10-03, corrigido no mesmo batch):** duas
  coisas faziam `tests/e2e/task-board.spec.ts` nem entrar no quadro — `tests/e2e/helpers.ts`
  usava `getByLabel("Senha")` e o botão "Mostrar senha" também é um `label` acessível desse texto
  (agora `getByLabel("Senha", { exact: true })`), e o teste de busca preenchia o input sem abrir a
  lupa (`?busca=` só existe depois de clicar em "Buscar tarefas"). Se a suíte e2e falhar no
  primeiro teste com *strict mode violation*, suspeite de rótulo duplicado antes de olhar o DOM.
- **A mesma correção existia em duas cópias, e só uma recebeu (medido 2026-10-05):** o
  `tests/e2e/shell.spec.ts` tinha `login()`/`CREDENTIALS` **próprios**, cópia do helper, e ficou
  com `getByLabel("Senha")` sem `exact` — os 3 testes do shell caíam no primeiro `fill` enquanto
  o quadro passava 7/7. Corrigido removendo a cópia e importando `login` de `./helpers`.
  **Regra da casa:** corrigido um helper, `grep` o nome dele no diretório antes de commitar —
  divergência entre cópia e original é o mesmo modo de falha que a 3.B achou nos dois menus do
  cartão.
- **Rodar um spec e2e exige o dev server no ar:** `playwright.config.ts` fixa
  `baseURL: http://localhost:3001` (o compose do repo serve em 3000, e a suíte de integração
  precisa do banco). O spec do quadro cria e apaga as próprias tarefas — depois de rodar, confira
  `select count(*) from tasks where title like 'E2E%'` na base (tem que dar 0).
- **WebAudio em jsdom = degradar em silêncio:** o jsdom não implementa `AudioContext`, então o seam
  `lib/notifications/alert-sound.ts` cai no caminho "sem suporte" (interruptor desabilitado, som
  inaudível). Para provar a parte cliente ele é testado em `// @vitest-environment node` com
  `vi.stubGlobal("window", { AudioContext: FakeAudioContext })` + `vi.resetModules()` por caso —
  o mesmo truque do `alert-sound` guardando o contexto em cache.
- **Roundtrip de integração precisa de banco no ar:** os roundtrips G4 do clean-arch
  (`tests/integration/*-roundtrip.test.ts`, environment `node`) rodam Prisma real contra
  o banco de teste **isolado** `dq-dev-test-db` em `127.0.0.1:5433` (exportar
  `DATABASE_URL` apontando para a 5433). Com o container parado, a suíte falha com
  "Can't reach database server"; re-arme com `docker start dq-dev-test-db` (NUNCA tocar
  no `display-quest-db`/`display-quest`). O roundtrip antigo `tests/integration/entities-roundtrip.test.ts`
  usa `localhost:5432` via `docker compose up -d postgres` (nome do serviço = `postgres`,
  container = `display-quest-db`) — `db` **não** é o nome do serviço.
- **Os roundtrips G4 colidiam entre si (medido 2026-10-05, corrigido no mesmo dia):** os
  `tests/integration/**` compartilham o **mesmo** banco e o Vitest roda arquivos em paralelo por
  padrão. `bulkGenerateWeeklyReports` resolve a lista de usuários ativos **uma vez** e itera
  período por período, enquanto `users-roundtrip` cria, aprova e **apaga** um usuário no mesmo
  intervalo. Dois modos, ambos medidos: o bulk encontra um usuário já apagado (`NotFoundError
  "Usuário não encontrado"`) e o relatório criado para o usuário do outro arquivo trava o
  `users.delete` pela FK `weekly_reports_userId_fkey`. Taxa medida: **~1 falha em 6** corridas de
  `tests/integration`. Correção: `vitest.config.mts` agora tem `test.projects` com a integração em
  projeto próprio e `fileParallelism: false`; unit/features continuam em paralelo. Custo medido:
  completa 35s → 47s, G3 30s → 35s; verde em 6/6 na integração e 7/7 na completa. Rodar um
  arquivo isolado não muda (2s).
  **Projeto de workspace NÃO herda do config raiz** — cada item abaixo foi omitido uma vez e
  quebrou de um jeito diferente: sem `resolve.alias` os roundtrips dão `Cannot find package
  '@/lib/database/prisma'`; sem `exclude` o `tests/e2e/**` entra como suíte falha (170 arquivos /
  1826 testes em vez de 83/1017); sem `plugins: [react()]` o `.tsx` falha no parse; sem
  `setupFiles` os shims de jsdom somem e 84 testes falham; sem `environment` o default do projeto
  é `node`. Serializar tudo (`fileParallelism: false` global) também conserta, mas custa 115s na
  completa e 102s no G3 — pagar 72s por concorrência que não colide.
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
