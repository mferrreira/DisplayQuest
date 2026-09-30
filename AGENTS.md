# AGENTS.md

Notas de trabalho para agentes neste repositório. Criado em 2026-08-29 durante a
mitigação de segurança A1–A11 (spec em `.spec/`).

## Verificação

- **Gate de entrega:** `npm run arch:check` (exit 0, allow-list **vazia**) && `npm run lint` (nada de erro) && `npx tsc --noEmit` (0) && `npx vitest run` (baseline atual: **67 arquivos / 1245 testes, zero failure** — a contagem só cresce; ver seção clean-arch).
- **G4/integração:** roundtrips Prisma real rodam **só** contra o banco de teste isolado `dq-dev-test-db` em `127.0.0.1:5433` (`$env:DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"; npx vitest run`) — nunca contra o `display-quest-db` (5432, produção local).
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
- **Quirks são contrato:** comportamento legado é pinado por golden tests e provado por
  contract tests antigo-vs-novo (fakes Prisma determinísticos em `tests/unit/modules/*`).
  Gateways legados em `infrastructure/*.gateway.ts` sobrevivem como seam desses testes
  (DEC-15/19); a wiring de produção não os usa.
- **Composição:** factories aceitam `repository?`/`ports?` (seam primário); publishers
  entre módulos entram por porta local injetada no composition root (DEC-21).
- **Estado/decisões:** `displayquest-v2/clean-arch/{PLAN.md,STATE.json}` (ondas 0–9
  concluídas em 2026-09-30: 41 batches, AC-00-01..15 met, DEC-01..DEC-25).

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
- **`floating-session-timer` (256/257) não se aplica a esta base:** o arquivo
  `tests/unit/components/floating-session-timer.test.tsx` citado pelo gotcha antigo
  **não existe nesta máquina/base** — o teste do timer aqui é
  `features/laboratorio/__tests__/floating-timer-tabs.test.tsx` (5 testes, na baseline).
  A suite desta base fecha sem failures (baseline atual 67 arquivos / 1245 testes;
  registrado no STATE.json do clean-arch). O gotcha original (auto-pause chamando
  `ResponsibilitiesAPI.pause()` sem mock de `@/contexts/api-client`) pertence a outra
  máquina; se o arquivo reaparecer, o fix sugerido continua sendo
  `vi.mock("@/contexts/api-client")` com `pause`/`resume` resolvidos.
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
- `tests/` está em `.gitignore` (linha 163) — os testes de mitigação ficam fora do commit
  a menos que se adicione `!tests/unit`.
- **Lint em git worktree falha (config-cascade):** o app é desenvolvido em worktrees em
  `.worktrees/`. Como worktree é dir aninhado, o ESLint conflita config-cascade
  (`.eslintrc.json` local vs `../../.eslintrc.json` do repo pai, exit ≠ 0 só em worktree).
  No repo pai `npm run lint` passa (exit 0, só warnings). **Workaround validado:** validar
  sempre com `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` (exit 0 limpo).
- **Enviar env para vitest em worktree:** o runner lê `process.env`, não `.env`, e o `.env`
  tem aspas nos valores. Exportar com `set -a; source .env; set +a; npx vitest run` (o
  `grep/cut` sem aspas também funciona).