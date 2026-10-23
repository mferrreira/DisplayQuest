# AGENTS.md

Notas de trabalho para agentes neste repositório. Criado em 2026-08-29 durante a
mitigação de segurança A1–A11 (spec em `.spec/`).

## Verificação

- **Gate de entrega:** `npm run arch:check` (exit 0, allow-list **vazia**) && `npm run lint` (nada de erro) && `npx tsc --noEmit` (0) && `npx vitest run` (zero failure). A contagem é **por branch**: no `dev` o baseline era **64 arquivos / 721 testes** quando o B8 removeu os 651 testes de paridade; no `plan/v3-operacional`, medido no encerramento do plan-v3 (2026-10-03), são **65 arquivos / 798 testes** em `tests/unit` + `features` e **75 / 881** na suíte completa. Na `dev` de hoje (medido em 2026-10-07, depois do plan-v4 V4-1/V4-2/V4-3/V4-6, do V4-4 de subtasks, dos testes do painel V4-4b/V4-4c, do V4-5a/V4-5b/V4-5c de subtask na UI, do V4-6b de vocabulário de status e do lote pós-encerramento POS-1 — DEC-97/98) são **87 arquivos / 1107 testes** e **97 / 1192** na suíte completa; a suíte e2e do quadro está em **2 passando + 1 falha conhecida + 5 "did not run"** (medido 2026-10-06
no V4-5c; eram 7 quando a coluna `Em Revisão` tinha um cartão a menos) — o 3º teste quebra por cartão a
mais na coluna (dado legítimo da instância, não código: hoje são as tarefas 50 e 304), e como o spec é
serial os outros 5 **nem rodam** (ver "Gotchas reais"). O e2e do shell está em 5 passando. Compare sempre com o `STATE.json` do plano em que você está. Na `dev` de hoje, medido no fechamento do plan-v6 (2026-10-16, ondas V6-0..V6-11: shell, Home, Projetos, detalhe do projeto, Laboratório, Relatórios, Perfil/Ranking, Loja, Admin, Login/Register), são **179 arquivos / 2224 testes** em `tests/unit` + `features` e **194 / 2354** na suíte completa (G0 1061 módulos / 4531 dependências); o `tsc` desta branch **fecha em 0** — o erro pré-existente em `features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105` foi consertado no `SUB-1` (regex ancorada no lugar do `exact`, que não existe em `ByRoleOptions`). Re-medido em 2026-10-15 (V6-2): o e2e do quadro está em **8 passando** (o spec hoje tem 8 testes; a falha conhecida por cartão a mais em `Em Revisão` **não reproduziu** — o dado da instância mudou; ela pode voltar se o dono mover outro cartão para lá) e o do shell em **5 passando**. Na branch do fechamento do repo-cleanup (`refactor/b6-restante`, medido 2026-10-08 depois do B6-2c..B6-7) o baseline é **95 arquivos / 1280 testes** em `tests/unit` + `features` e **105 / 1367** na suíte completa (G0 810 módulos / 3295 dependências). Na branch do plan-v8 (`plan-v8/gamificacao`), medido no fechamento da onda **V8-5** (2026-10-22), são **199 arquivos / 2400 testes** no projeto unit (`tests/unit` + `features/**/__tests__` + `entities`) e **220 / 2561** na suíte completa, com **G4 21 / 161** contra a 5433 e G0 **1140 módulos / 4833 dependências** (allow-list vazia), `tsc` 0 e lint exit 0 com **17** warnings pré-existentes (a nota de "15 warnings" das ondas V8-0/V8-1/V8-2 não reproduz nesta árvore: conferido com `git stash`, sem a onda a árvore também dá 17). Medido no fechamento da onda **V8-6** (2026-10-23), na mesma branch: **204 arquivos / 2469 testes** no projeto unit e **225 / 2634** na suíte completa, com **G4 21 / 165** na 5433 e G0 **1152 módulos / 4889 dependências** (allow-list vazia), `tsc` 0 e lint exit 0 com os mesmos **17** warnings. Medido no fechamento da onda **V8-7** (2026-10-23), na mesma branch: **212 arquivos / 2525 testes** no projeto unit e **234 / 2695** na suíte completa, com **G4 22 / 170** na 5433 e G0 **1172 módulos / 4984 dependências** (allow-list vazia), `tsc` 0 e lint exit 0 com os mesmos **17** warnings (os quatro warnings que aparecem no conjunto alterado da onda são todos preexistentes); o e2e foi re-medido na worktree contra a 5433, com dev server próprio na porta 3002 e config Playwright temporário: **quadro 8 passando e shell 5 passando** (ver as três notas novas em "Gotchas reais"). Medido no fechamento da onda **V8-8** (2026-10-23), na mesma branch: **213 arquivos / 2528 testes** no projeto unit e **235 / 2698** na suíte completa, com **G4 22 / 170** na 5433 e G0 **1177 módulos / 4988 dependências** (allow-list vazia — o salto de +5 módulos vem da fechadura `tests/unit/prisma/seed-resolution.test.ts` e do `prisma/seed.dev.ts` agora alcançado), `tsc` 0, lint exit 0 nos arquivos da onda, `docs:build` e `docs:check` verdes; o e2e não foi re-medido porque nada do quadro nem do shell mudou.
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
- **Secrets:** `npm run check:env` valida `NEXTAUTH_SECRET` (≥32, sem placeholder), a
  senha do banco (denylist) e, desde o V5-1, `S3_SECRET_KEY` (obrigatória — o serviço do
  bucket recusa subir sem ela — e fora da denylist `minioadmin`/`any`/`changeme`). O runner
  lê `process.env`, não `.env` — exporte as variáveis.

## plan-v8 — gamificação remodelada (aberto 2026-10-22)

- **Estado:** `in_progress` — **V8-8 done em 2026-10-23** (fechamento G5/G6: RB-84..RB-88 no capítulo 07 e rastreabilidade até RB-88; guia com as sete capturas novas do perfil/quadro/painel e as abas Horas e Visão Geral reescritas a partir do que os PNGs medem; 22 capturas (8 novas, 14 refeitas); o require do seed nomeando `./seed.dev.ts` (DEC-227, dívida `SEED-DEV-JS`); gates unit+features **213 arquivos / 2528 testes**, suíte completa **235 / 2698**, G4 **22 / 170** na 5433, G0 **1177 módulos / 4988 dependências** com allow-list vazia, `tsc` 0, lint exit 0 nos arquivos da onda com os mesmos 17 warnings, `docs:build` (técnico 15 seções / 33 figuras; guia 12 seções / **53** figuras) e `docs:check` verdes; e2e **não re-medido** na onda — nenhum arquivo do quadro nem do shell mudou. Próxima onda: **V8-CLOSE**. Antes, **V8-7 done em 2026-10-23** (troféus e trilhas na UI: `ListMonthlyRankingUseCase` +
  `prisma-monthly-ranking.port.ts` com quatro queries em lote e a régua `points → tarefas do mês → xp → userId`
  DECIDIDA NO SERVIDOR (elo DERIVADO do XP, não a coluna), mais `GET /api/gamification/ranking` e o quadro
  reescrito com as colunas Posição / Usuário / Pontos / Tarefas (mês) / Elo / Troféus / Moedas e a tabela
  começando no 4º; livro-caixa da temporada por `GET /api/gamification/season-book`; perfil com `SeasonCard`,
  prateleira equipável lida por `GET /api/users/[id]/trophies` (o use case junta a conquista ao catálogo — a tela
  de conquistas estava VAZIA porque `toUserBadge` não entrega o catálogo) e histórico dos ciclos por
  `GET /api/users/[id]/gamification/history` (meses fechados, temporadas fechadas, `championYears` lidos da
  `position` 1); `components/ui/user-badges.tsx` apagada; vocabulário "Badges" → "Troféus" na TELA (aba e
  formulário; valor interno da aba, componente, API e tabela continuam `badges`) e ícone do placar `Zap`
  (ASK-V8-23, respondida 2026-10-22); guardas novos `tests/unit/domain/gamification/gamification-vocabulary.test.ts`
  (12 casos) e `trophy-window-guard.test.ts` estendido para a **quarta conta de tarefa** (16); gates medidos na
  onda: unit+features 212 arquivos / 2525 testes, suíte completa 234 / 2695, G4 22 / 170 na 5433, G0 1172 módulos /
  4984 dependências com allow-list vazia, `tsc` 0, lint exit 0 com 17 warnings, G5 com os capítulos do guia
  07/08/09/10/11 e os técnicos 02/09/10/13 (`docs:build` dos dois documentos + `docs:check` verdes); G6 não
  re-captura — `ranking-participante`, as três capturas de perfil e `painel-administrativo` ficaram antigas e a
  prateleira não tem captura nenhuma (lote somado à dívida G6 da V8-2); e2e do quadro e do shell re-medidos na
  worktree contra a 5433 com servidor próprio na 3002, com **DEC-224** (identidade do coordenador lida da sessão)
  e **DEC-225** (altura do quadro comparada entre dois estados assentados); nenhuma migration de schema nova na
  onda. Antes, **V8-6 done em 2026-10-23** (escada de elo da temporada com coluna nova
  `users.elo` (migration `20261023120000_add_users_elo`, 24 linhas em `_prisma_migrations`), equip/desequip de
  troféu pela rota `PATCH /api/users/[id]/trophies` com autoridade da própria pessoa e slot do elo do momento, motor
  de critérios reescrito com janela `mes|temporada|vida` (QUIRK-6C consertado: condição desconhecida não concede;
  critério `0` é avaliado; chave fora do vocabulário não concede) e efeito de troféu com verbo+tier aplicado no
  instantâneo do credit, com `latePenalty` atravessando a porta de tarefa; painel de troféus com janela e efeitos do
  menu (nenhum número livre); `GET /api/users/[id]/gamification` re-significada (trilhas + degrau + slots), o que
  fecha a dívida XP-DUPLICADO; gates medidos na onda: unit+features 204 arquivos / 2469 testes, suíte completa
  225 / 2634, G4 21 / 165 na 5433, G0 1152 módulos / 4889 dependências com allow-list vazia, `tsc` 0, lint exit 0
  com 17 warnings, G5 com os capítulos técnicos 07/09/10/11/13/14, os dois diagramas do engajamento e as seções
  07/09/11 do guia atualizados (`docs:build` dos dois documentos + `docs:check` verdes); G6 não re-captura — nenhuma
  captura versionada mostra o formulário de troféus do painel. Data migration
  `prisma/data-migrations/v8-6-badge-criteria-vocab.sql` (**DEC-223**) conferida na 5433 por tabela temporária com
  rollback e aplicada lá (`UPDATE 0`: as linhas já estavam convertidas); na 5432 real ela roda no V8-CLOSE. Próxima
  onda: **V8-8** (fechamento G5/G6: `docs:build`/`docs:check` com o texto técnico e de usuário, recaptura das
  telas do guia que mudaram, re-leitura da prosa). Antes, **V8-5 done em 2026-10-22** (moeda vitalícia: o prêmio de atividade
  aprovada credita `users.coins` com `track COINS`, a loja cobra, debita e estorna moeda, e o painel ajusta as
  duas trilhas separadas com linha de auditoria; gates medidos na onda: unit+features 199 arquivos / 2400
  testes, suíte completa 220 / 2561, G4 21 / 161 na 5433, G0 1140 módulos / 4833 dependências com allow-list
  vazia, `tsc` 0, lint exit 0 com 17 warnings, G5 com os capítulos 4/7/9/11/12 do guia e o modelo conceitual
  técnico atualizados (`docs:build` dos dois documentos + `docs:check` verdes); nenhuma migration de schema
  nova — 23 linhas em `_prisma_migrations`, e as data migrations da V8-1 e da V8-4 seguem esperando a 5432 no
  V8-CLOSE). Antes, **V8-4 done em 2026-10-22** (fechamento de temporada anual: `season.ts` no
  domínio, `CloseSeasonUseCase` com `season_history` + zeragem de `points`/`xp` na mesma transação, troféu
  CAMPEÃO ao primeiro colocado com chave `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>`, cron `5 0 1 1 *`;
  gates medidos na onda: unit+features 198 arquivos / 2378 testes, suíte completa 218 / 2532, G4 20 / 154 na
  5433, G0 1135 módulos / 4808 dependências com allow-list vazia, `tsc` 0, lint exit 0 com 17 warnings, G5
  com a décima entrada da agenda nos dois inventários de `docs/src`; nenhuma migration de schema nova — 23
  linhas em `_prisma_migrations`, e a data migration `prisma/data-migrations/v8-4-badge-campeao.sql` aplicada
  **só na 5433** (troféu no catálogo com `criteria` nulo; aplicada duas vezes: `INSERT 0 1` e depois `INSERT 0 0`).
  Antes, **V8-3 done em 2026-10-22** (motor de XP da temporada: `xp-rules.ts` no
  domínio, credit +10/+10/+20 na transação do award com linha `track "XP"`, `ReviewWeeklyXpUseCase` com
  boosts e penalidades e piso 0, cron `10 0 * * 1`; gates medidos na onda: unit+features 195 arquivos /
  2347 testes, suíte completa 214 / 2495, G4 19 / 148 na 5433, G0 1125 módulos / 4770 dependências com
  allow-list vazia, `tsc` 0, lint exit 0 com 17 warnings, G5 com a nona entrada da agenda nos dois
  inventários de `docs/src`; nenhuma migration nova — 23 linhas em `_prisma_migrations`). Antes,
  **V8-2 done em 2026-10-22** (ciclo mensal: `ResetMonthlyPointsUseCase`, `month_history` escrito, cron
  `0 0 1 * *`; gates da onda: unit+features 192 arquivos / 2317 testes, suíte completa 210 / 2460,
  G4 18 / 143 na 5433, G0 1117 módulos / 4741 dependências com allow-list vazia, `tsc` 0, lint exit 0,
  G5 `docs:build` dos dois documentos + `docs:check` verdes; nenhuma migration nova).
  Antes, **V8-1 done em 2026-10-22** (schema + virada 1:1 + saída de
  `projects.points`; gates medidos na onda: unit+features 189 arquivos / 2289 testes, suíte
  completa 206 / 2427, G4 17 / 138 na 5433, G0 1109 módulos / 4713 dependências com allow-list
  vazia, `tsc` 0, `npm run lint` exit 0 com 15 warnings). Antes disso, **V8-0 done em 2026-10-22**
  (baseline re-medido: 188 arquivos / 2288 testes em `tests/unit` + `features` + `entities`,
  204 / 2419 na suíte completa, G4 16 / 131 contra a 5433, G0 1106 módulos / 4703 dependências com
  allow-list vazia, `tsc` 0, `npm run lint` exit 0 com 15 warnings). DEC-211..220 **abertas** no registry, cada uma com a
  onda indicada, mais **DEC-221** (regime de execução) e **DEC-222** (moeda não aceita saldo negativo no
  ajuste do painel), as duas abertas 2026-10-22, mais **DEC-223** (a data migration do vocabulário de critério troca
  `minHours` por `weeklyHours` por EDIÇÃO do Json, não por reconstrução do objeto; catálogo das 5432 medido: duas
  linhas `{"minHours": 10}` sem janela), aberta 2026-10-23 na V8-6; mais **DEC-224** (o e2e do quadro lê a
  identidade do coordenador de `/api/auth/session`, com cache por contexto de request, em lugar do
  `COORDENADOR_ID = 2` da instância do dono) e **DEC-225** (a asserção de altura do quadro compara dois estados
  assentados do mesmo quadro, não um teto absoluto), as duas abertas e executadas na V8-7; mais **DEC-226** (os
  capítulos técnicos seguem dizendo "distintivo" enquanto a tela diz "troféu": a correspondência foi declarada no
  capítulo 9 em vez de reescrever dez capítulos; renomear é decisão do dono no fechamento), aberta 2026-10-23;
  mais **DEC-227** (`prisma/seed.ts` nomeia a extensão do arquivo que exige: sem ela o require resolve o
  artefato compilado e versionado `prisma/seed.dev.js`, que roda o próprio `main()` com o conteúdo de um
  seed antigo e o script reporta "Seed completa finalizada" deixando a base no estado dos roundtrips —
  aberta e executada na V8-8, com dívida `SEED-DEV-JS` para o dono remover o artefato), aberta e executada
  2026-10-23; próxima livre **DEC-228**). **Regime (DEC-221):** uma onda por vez, autorizada pelo orquestrador do thread
  — sem espera de ordem explícita a partir da V8-1; pare e reporte no fim de cada onda; commit
  `plan-v8 <ONDA>: …` com o `STATE.json` atualizado no mesmo commit; durante o plano a
  migration é escrita e aplicada **só na 5433** (deploy, roundtrips G4 e e2e da worktree rodam
  lá) e o deploy na **5432 real** do dono acontece apenas no batch **V8-CLOSE**, pelo caminho
  offline medido no V4-4, seguido de merge (PR único `plan-v8/gamificacao` → `dev`, aberto e
  vigiado pelo orquestrador), restart da instância e e2e na 5432. Estado/decisões/modelo:
  `displayquest-v2/plan-v8/{MODELO.md,PLAN.md,STATE.json}` — MODELO.md é a fonte do
  comportamento, fechado em 6 rodadas de perguntas ao dono em 2026-10-22; ondas V8-0..V8-8 e
  V8-CLOSE; ASK-V8-23 (ícone
  do placar — troca para moeda/raio, Trophy fica só dos troféus) e ASK-V8-24 (ajuste manual
  do painel sobre as duas trilhas, cada ajuste com linha de `history`) **respondidas pelo
  dono em 2026-10-22**; calibrações adiadas ASK-V8-21/22 (constantes de XP e umbrais de
  elo, depois do primeiro ano real).
- **A V8-7 entregou (2026-10-23):** as trilhas e os troféus na tela, com o número vindo do servidor. Regras e
  ports de leitura em `backend/modules/gamification/`: `application/ports/monthly-ranking.port.ts` +
  `infrastructure/repositories/prisma-monthly-ranking.port.ts` (`users` com `points`/`coins`/`xp` — sem
  `completedTasks` nem `elo`; `task_user_progress.groupBy` por `userId`; `tasks.groupBy` por `assignedTo` com
  `assignedTo: { not: null }`, `isGlobal: false` e `taskVisibility: { not: "public" }`; `user_badges.groupBy`
  contando total e equipados), `list-monthly-ranking.use-case.ts` (janela do mês do `now`, `rankSeasonStandings`
  reaproveitado, elo derivado por `eloForSeasonXp`), `read-season-ledger.use-case.ts` (livro do último ano
  fechado), `read-user-cycle-history.use-case.ts` (meses e temporadas fechadas + `championYears` pela `position` 1)
  e `list-user-trophies.use-case.ts` (conquista × catálogo, efeitos por `readTrophyEffects`, linha sem catálogo
  descartada). Rotas: `app/api/gamification/ranking`, `app/api/gamification/season-book`,
  `app/api/users/[id]/gamification/history` e o GET em `app/api/users/[id]/trophies` (leitura aberta; as quatro
  rotas recusam 401 e 400 **antes** de tocar qualquer port). Telas: `components/ui/season-card.tsx`,
  `components/ui/user-trophies.tsx` (com `UserTrophiesChip`), `components/ui/cycle-history.tsx`, quadro reescrito
  (`app/(dashboard)/dashboard/leaderboard/page.tsx`: "Sua posição", campeão do mês com capa, 2º/3º, Classificação
  completa a partir do 4º, livro-caixa; sem `.sort(`) e perfil reescrito (`app/(dashboard)/dashboard/profile/page.tsx`:
  três cifras, `SeasonCard`, prateleira com `canEquip`, histórico dos ciclos; sem o fact "Posição" nem o fetch de
  ranking). `components/ui/user-badges.tsx` foi apagada; `user-profile-view.tsx` e `user-search.tsx` consomem
  `UserTrophies`/`UserTrophiesChip`. Guardas: `tests/unit/domain/gamification/gamification-vocabulary.test.ts` (12)
  e `trophy-window-guard.test.ts` (16, quatro contas), `tests/integration/monthly-ranking-roundtrip.test.ts` (5).
- **Oito decisões de execução da V8-7:** (1) A tela de conquistas estava **VAZIA** por um motivo de camada:
  `toUserBadge` não inclui o badge, `user_badges.badge` é `Cascade` (órfão não existe no banco) e o componente
  filtrava linha sem catálogo — sobrava nada. O conserto é `ListUserTrophiesUseCase` juntando
  `UserBadgePort.findByUserId` + `BadgeCatalogPort.findAll`, sem tocar o contrato aberto `GET /api/user-badges`.
  (2) Uma superficie por leitura: `user-badges.tsx` saiu (nenhum importador vivo; `UserBadgesCard` era código
  morto) e a guarda fecha a volta das frases "Gerenciar Badges"/"Badge ativo". O vocabulário novo é de **tela**:
  aba, componente, API e tabela continuam `badges`/`BadgesAPI`/`value="badges"`. (3) O elo do quadro é derivado
  do XP e isso foi provado com dado do banco: a pessoa do roundtrip tem a **coluna** `users.elo` em DIAMANTE com
  `xp = 0`, e a linha do quadro diz BRONZE — ler a coluna mostraria um degrau que não casa com os slots que a
  escada abre (DEC-217). O elo do livro-caixa é outro: o degrau fotografado no fechamento, lido como foi gravado.
  (4) O lote do quadro é a **quarta conta de tarefa** da casa (fechamento mensal, revisão semanal de XP, critério
  de troféu, ranking). `trophy-window-guard.test.ts` confere os quatro adaptadores letra a letra, aceitando só o
  recorte do lote (`by: ["assignedTo"]` + `assignedTo: { not: null }` no lugar de `assignedTo: userId` — recorte
  diferente, mesma população), e o roundtrip conferiu o **número** na 5433, pessoa por pessoa, contra
  `UserStatsPort.countTasksCompletedSince` na mesma janela; a tarefa pública atribuída com linha de progresso conta
  UMA vez. (5) Quem ordena é o domínio: a tela fazia `[...users].sort((l, r) => r.points - l.points)` — uma
  segunda régua na UI, sem desempate e sem tarefas do mês — e a guarda confere que não existe `.sort(` na página.
  (6) Ordem de recusa medida: 401 antes de qualquer port, 400 `"Usuario invalido"` antes de qualquer port,
  VOLUNTARIO com leitura aberta de histórico e troféus de outra pessoa, e `GET /api/users/[id]/gamification`
  continuando self OU `MANAGE_USERS` (saldo vivo é restrito, livro é aberto). (7) O campeão do perfil é
  reconhecido pela `position` 1 do livro (`championYears`), não pelo nome na tela;
  `SEASON_CHAMPION_BADGE_NAME` só marca o card correspondente. (8) Os capítulos técnicos de `docs/src` seguem
  dizendo "distintivo" (DEC-226): a correspondência com "troféu" da interface foi declarada no começo do
  capítulo 9 em vez de reescrita em dez capítulos.
- **A V8-6 entregou (2026-10-23):** o elo, o equip e o motor novo. Regras puras em
  `backend/domain/gamification/elo-rules.ts` (`ELO_XP_THRESHOLDS` 0/400/900/1500/2400/3600,
  `ELO_TROPHY_SLOTS` 0/1/2/2/3/3, `FIRST_SEASON_ELO`, `seasonClosingEloForXp`, `trophySlotMessage`),
  `trophy-effects.ts` (verbo+tier fechados, `TROPHY_TIER_PERCENT` 5/10/15%, boost sobre a base antes da penalidade,
  redução de penalidade com teto 100%) e `trophy-equip-rules.ts` (ações, frases, chave de auditoria,
  `canEquipWithinSlots`), mais `requireActorSelf` em `backend/domain/identity/assert-permission.ts`, a porta
  `trophy-equip.port.ts` com o adaptador `prisma-trophy-equip.port.ts` (linha `TROPHY_EQUIP | TROPHY_UNEQUIP` com
  `oldValues { equipped }` e `newValues { equipped, ...auditoria, elo, slots }`; `unchanged` não escreve), o
  `ChangeTrophyEquipUseCase` e a rota fina `app/api/users/[id]/trophies` (sem cliente em `contexts/api-client.ts`
  até a V8-7 ter tela). O motor de critérios foi reescrito em `badge-rules.ts`: `WINDOW_METRICS` por janela,
  `normalizeBadgeCriteria`, `badgeCriteriaMet` com limiar AVALIADO, `specialConditionMet` de vocabulário fechado,
  `trophyFactReadsFor`, e `trophyMetricsForWindow` com a temporada somando os meses fechados **mais** o mês em curso.
  `prisma-user-stats.port.ts` ganhou `countTasksCompletedSince` (as DUAS famílias com as MESMAS condições do
  fechamento mensal e da revisão semanal) e `closedSeasonSums` lida por `seasonMonthPrefix`. O efeito é aplicado nos
  três awards, o elo é rederivado no MESMO `$transaction` do credit de XP, e `close-season` grava
  `season_history.elo` pelo XP do ano. O painel `components/admin/badge-manager.tsx` passou a ter
  **Janela do critério**, as métricas só da janela escolhida, **Condição especial** e **Efeitos equipáveis**
  (Verbo + Tier do menu). `GET /api/users/[id]/gamification` reporta `points`/`coins`/`xp`/`elo`/`trophySlots`.

- **Sete decisões de execução da V8-6:** (1) PRATA tem **slot 1** (a escada é 0/1/2/2/3/3), e a frase do slot é
  singular quando o limite é 1 (`Seu elo Prata permite equipar até 1 troféu.`) — a frase é a resposta 409 e foi
  medida, não derivada. (2) `points` é métrica do **mês** e `xp` é métrica da **temporada**; nenhuma das duas é
  métrica de `vida`, e `specialCondition` só é métrica de `vida` — as condições de unicidade só fecham na janela que
  carrega a métrica ("primeiro a 100 **pontos**" exige `mes`, "primeiro a 100 **tarefas**" exige `vida`). Um critério
  gravado antes da onda que pede métrica que a janela não mede **não concede**: é o motor dizendo "não meça o que não
  mede", e a data migration da DEC-223 trata o `minHours` legado exatamente por esse caminho. (3) O efeito incide
  sobre a **base antes da penalidade**, e a redução de penalidade tem teto de 100%; o valor só existe enquanto o
  troféu está equipado, e a linha do credit declara o troféu — o Prisma descarta `trophy: undefined`, então a linha
  sem efeito continua **sem** a propriedade. (4) A penalidade entrou no contrato do award como `latePenalty`
  (evento → command → use case) porque o boost precisa saber o que é base e o que é punição;
  `task_user_progress.awardedPoints` continua guardando o valor da régua e o ledger, o valor creditado — divergência
  aceita e medida. (5) Autoridade do equip é da **própria pessoa**, e o sistema **não** passa (`requireActorSelf`):
  nenhuma rotina equipa troféu de ninguém, e o gate corre **antes** de ler o troféu — o 403 não escreve linha.
  (6) O elo fotografado no livro é o degrau do XP com que o ano fechou (`seasonClosingEloForXp`) e a coluna volta a
  `BRONZE` na virada, o que substitui o "elo nulo por decisão" da V8-4: o ano fechado continua legível depois da
  zeragem. (7) Quem decide **o que a avaliação paga** é o domínio (`trophyFactReadsFor`), não token escrito no use
  case, e as três contas de tarefa (fechamento mensal, revisão semanal, critério do troféu) compartilham as MESMAS
  condições de família e visibilidade — o guarda `tests/unit/domain/gamification/trophy-window-guard.test.ts` confere
  as listas de leitura contra a **composição real** das métricas, para que não virem uma segunda régua.

- **A V8-1 entregou (2026-10-22):** `users.coins`/`users.xp` (Int, default 0) com as relações
  `monthHistory`/`seasonHistory`; os modelos `month_history` (`month String` `YYYY-MM`,
  `@@unique([userId, month])`) e `season_history` (`year Int`, `elo`/`position` nulos,
  `@@unique([userId, year])`), os dois com `onDelete: Cascade` no caso do `weekly_hours_history`;
  `history.track String @default("POINTS")`; `badges.effects Json?`; `user_badges.equipped Boolean
  @default(false)`; e `projects.points` fora do sistema (coluna, campo na tela, `incrementPoints`
  do adaptador, `TaskProjectPointsPort` do publicador DEC-63). Migration pelo caminho offline do
  V4-4 (`migrate diff` → gravar → `migrate deploy` → `generate`), aplicada **só na 5433** (23
  linhas em `_prisma_migrations`); a data migration `prisma/data-migrations/v8-1-virada-1-1.sql`
  (coins = points 1:1, placar zerado, `window: "vida"` nos critérios do catálogo) foi aplicada na
  5433 e conferida por soma (`sum(points)` 14 → 0, `sum(coins)` 0 → 14). Ela roda na **5432 real**
  apenas no V8-CLOSE.
- **A V8-2 entregou (2026-10-22):** o fechamento mensal do placar, **sem rota nenhuma** — só pela
  agenda. Regras puras em `backend/domain/gamification/monthly-cycle.ts` (mês fechado = o anterior a
  `now`, janela `[start, endExclusive)` ancorada em `startOfCivilDayInstant`, audiência "saldo ≠ 0 OU
  atividade no mês", `POINTS_AFTER_MONTH_CLOSE = 0`); port `MonthlyPointsCyclePort` e adapter
  `prisma-monthly-points-cycle.port.ts`, onde a `$transaction` escreve `month_history` e **depois**
  zera `users.points` (P2002 devolvido como `already-closed`); `ResetMonthlyPointsUseCase` com gate
  `MANAGE_USERS` e `resetMonthlyPoints` no `GamificationModule`; job `'0 0 1 * *'`
  (`America/Sao_Paulo`) agendado logo depois do weekly reset, com
  `systemActor(SYSTEM_REASONS.MONTHLY_POINTS_RESET)` (DEC-54). Snapshot guarda negativo; coluna
  recomeça em 0; **o QUIRK-7C do weekly reset não foi herdado** (DEC-212).
- **A V8-3 entregou (2026-10-22):** o motor de XP da temporada, **sem rota e sem tela nova** (a trilha na
  UI é V8-6/V8-7). Regras puras em `backend/domain/gamification/xp-rules.ts` (constantes da DEC-214;
  `weeklyTasksBoost` **substitutivo** — 10+ tarefas vale 40 no lugar de 20, nunca soma;
  `weeklyConsistencyBoost` em 7 dias com sessão; `weeklyGoalMissed` só quando `weekHours > 0`;
  `applyXpFloor` com piso 0; `weeklyXpAdjustments` devolvem a decisão item a item; `xpWeekWindow` é
  `[segunda 00:00 America/Sao_Paulo, +7d)` com corte de fim exclusivo, aritmética de dia civil do domínio
  — **não** a janela `date-fns` de relógio local do relatório de horas, QUIRK-7B); credit de XP nos três
  eventos existentes (`award-from-task-completion` +10, `award-from-work-session` +10,
  `award-from-activity-completion` +20 **por membro**), escrito no MESMO `$transaction` do prêmio como
  segunda linha de `history` com `track XP_GAMIFICATION_TRACK`; `ReviewWeeklyXpUseCase` com gate
  `MANAGE_USERS` e `reviewWeeklyXp` no `GamificationModule`; job `'10 0 * * 1'` (`America/Sao_Paulo`)
  agendado logo depois do fechamento mensal, com `systemActor(SYSTEM_REASONS.WEEKLY_XP_REVIEW)` (DEC-54).
- **Quatro decisões de execução da V8-3:** (1) A chave do credit é
  `GAMIFICATION:XP:<sourceType>:<sourceId>`, não só `<sourceId>`: `sourceId` vem de tabelas diferentes
  (tarefa, sessão, atividade), então `GAMIFICATION:XP:5` poderia ser tarefa 5 **ou** sessão 5 e perderia
  um credit. A idempotência continua a descrição da fonte de PONTOS (`alreadyAwarded` curto-circuita), o
  que significa que prêmios anteriores à onda não ganham XP retroativo — a temporada começa a contar da
  implantação do motor (consequência aceita e documentada). (2) `AwardRecord` ganhou o bloco opcional
  `xp { description, amount }` e **perdeu** `xpAwarded`; `GamificationAwardResult.xpAwarded` passou a
  significar o XP creditado em `users.xp` (10/10/20/0) — medido por grep: nenhuma rota consumia o espelho
  anterior. (3) A deduplicação semanal **não tem tabela nova**: a linha do próprio ledger
  `GAMIFICATION:XP:WEEKLY_REVIEW:<userId>:<weekStart>` é a chave, lida antes de escrever (use case) e
  reconfirmada dentro da `$transaction` (adaptador devolvendo `applied: false`), por isso a onda não
  precisou de migration. Semana sem ajuste não escreve linha: o livro-caixa registra o que aconteceu.
  (4) O port devolve **fatos**, nunca decisão (mesmo desenho da V8-2): as atividades da semana são lidas
  das linhas de award da janela (`newValues.sourceType = ACTIVITY_COMPLETED`, dedup por atividade) — é a
  lista Hamilton de DEC-164 já materializada, então quem recebeu distribuição paga −20/−30 e quem não
  recebeu não ganha +20 nem paga; atraso usa as réguas existentes (`daysLateForTask` DEC-97,
  `activityPeriod` + `civilDaysBetween` DEC-103) e a sessão que quita o −30 é a que solapa o período da
  linha **no mesmo projeto** (ou sem projeto declarado).
- **A V8-5 entregou (2026-10-22):** a moeda vitalícia em funcionamento, **sem rota nova e sem tela nova de
  trilha**. O prêmio de atividade de cronograma aprovada (DEC-215: `100 × meses`, ×1,5 se a aprovação é ≥2 dias
  civis antecipada, −10%/dia de atraso com **piso 0** DEC-103/74, distribuição Hamilton DEC-164 intacta) escreve
  `users.coins` com a linha do ledger em `track COINS`; a loja cobra, debita e estorna na MESMA moeda
  (`createWithCoinDeduction` / `refundCoins`, frase "Moedas insuficientes. Você tem X moedas, mas precisa de Y
  moedas"); o painel admin ajusta **as duas trilhas separadas** (`set`/`add`/`remove` de PONTOS do mês e de
  MOEDAS), cada ajuste gravando linha `action TRACK_ADJUSTMENT` com trilha, saldo antes e depois, assinada pelo
  ator (`ASK-V8-24`). Regras puras em `backend/domain/gamification/track-adjustment-rules.ts`; port
  `TrackAdjustmentLedgerPort` com o adaptador `prisma-track-adjustment.port.ts`; `AdjustUserBalanceUseCase`
  (renomeado de `UpdateUserPointsUseCase`) e `adjustUserBalance` no módulo; rota `PATCH
  /api/users/[id]/points` com corpo `{ track, action, amount }` (`track` ausente = `POINTS`).
- **Seis decisões de execução da V8-5:** (1) O valor do prêmio e a régua não mudaram — só o destino. O roundtrip
  leu os 450/225/225 em `coins` e conferiu, no mesmo registro, que `points` continua 0: as duas colunas coexistem
  em `users` e um `increment` na coluna errada passaria no `tsc` sem nada dizer. (2) O contrato interno do award
  parou de mentir: `AwardRecord.pointsAwarded` → `amount` + `track?` (`AwardBalanceTrack = POINTS | COINS`; XP
  nunca é trilha primária de um award — entra pelo bloco `xp`, e o `tsc` recusa `track: "XP"`), e
  `GamificationAwardResult.pointsAwarded` → `amountAwarded` + `track`. A chave do montante no JSON **nomeia a
  trilha da linha** (`pointsAwarded` / `coinsAwarded` / `xpAwarded`) em vez de uma chave genérica: a linha lida de
  volta diz o que significa, e as linhas antigas continuam corretas porque a coluna `track` delas diz POINTS.
  (3) O seam do projeto falou moeda junto (`coinsAwarded`, `coins`, `shares: { userId, coins }`) — medido por grep
  que nenhuma tela consome `award`/`shares`; o que a tela mostra é a frase, que virou "N moedas distribuídas…".
  (4) A aritmética do ajuste saiu do use case e virou regra pura aplicada pelo adaptador **sobre o saldo lido
  dentro do `$transaction`** — o número que cai na coluna e o que a linha reporta são o mesmo número, e dois
  cliques concorrentes não gravam saldo fantasma. (5) **DEC-222**: na moeda nenhuma das três ações escreve saldo
  negativo (`set` abaixo de zero é recusado). A DEC-60 (negativo aceito) foi decisão da trilha pontos e pela razão
  dela — a premiação de tarefa produz total negativo (DEC-39); na moeda nenhuma fonte produz negativo (prêmio com
  piso 0) e moeda negativa seria débito de loja. O painel espelha a régua (o `min` do input volta a 0 na moeda).
  (6) O ajuste é família separada do credit: `hasAward` lê `GAMIFICATION_AWARD`, e o roundtrip provou no banco que
  a mesma forma de chave (`GAMIFICATION:ADJUSTMENT:…`) devolve zero linhas na consulta do award; a varredura do
  feed de tarefa (que apaga `entityType: "task"`) também não alcança a linha. Consequência medida:
  `history.performedBy` é RESTRICT, então a linha assinada pelo gestor bloqueia a deleção do gestor —
  `users-roundtrip.test.ts` teve que criar uma pessoa de gestão de verdade (o harness usava id 1, que não existe
  na 5433) e apagar a própria linha antes das pessoas.
- **Moeda no read model (V8-5):** moeda é legível pela própria pessoa ou pela gestão — a MESMA regra do CPF
  (`canActorReadUserCpf`). `toPublicUser` (a lista sem direito) não projeta moeda; existe `toPublicUserWithCoins`
  para o ajuste e para a leitura com direito. `entities/user.ts` tem `coins` opcional e `contexts/types.ts`
  também; os consumidores medidos são a tela da loja (cabeçalho "moedas disponíveis", botão "Moedas insuficientes",
  colunas "Preço (Moedas)") e o painel (o "Atual" da trilha escolhida). `UserRecord.coins` é opcional no port
  porque o Prisma descarta `undefined` no update: fixture antiga não apaga a coluna.
- **A V8-4 entregou (2026-10-22):** o fechamento da temporada anual, **sem rota e sem tela nova**. Regras puras
  em `backend/domain/gamification/season.ts` (`closingSeasonYearOfInstant`, `seasonMonthPrefix`,
  `isSeasonParticipant`, `compareSeasonStandings` / `rankSeasonStandings`, `seasonChampionOf`,
  `SEASON_CHAMPION_BADGE_NAME`, `seasonChampionDescription`); ports `SeasonCyclePort` (agregado do ano em duas
  queries, `getSeasonSnapshot`, `closeSeason` escrevendo `season_history` + `users.points = 0` + `users.xp = 0` no
  mesmo `$transaction`, `listSeasonStandings`) e `SeasonChampionPort` (concessão idempotente do troféu) com os
  adaptadores `prisma-season-cycle.port.ts` e `prisma-season-champion.port.ts`; `CloseSeasonUseCase` (gate
  `MANAGE_USERS`) e `closeSeason` no `GamificationModule`; job `'5 0 1 1 *'` (`America/Sao_Paulo`) agendado logo
  depois do fechamento mensal, com `systemActor(SYSTEM_REASONS.SEASON_CLOSE)` (DEC-54); troféu **CAMPEÃO** seedado
  pela data migration `prisma/data-migrations/v8-4-badge-campeao.sql` e pelo `prisma/seed.dev.ts`.
- **Seis decisões de execução da V8-4:** (1) O ano fechado é o **anterior** ao ano civil do `now` em dia civil SP,
  e o job das `00:05` de 1/jan roda cinco minutos **depois** do fechamento mensal das `00:00` — que fotografou
  dezembro — então a soma do ano recém-fechado já inclui dezembro e nenhum ano em curso é fechado.
  (2) O troféu entra no catálogo por **seed com `criteria` nulo**, não por critério: com critério nulo
  `badgeCriteriaMet` corta em `!criteria` e não concede nada, enquanto uma `specialCondition` nova cairia no
  **QUIRK-6C** (condição desconhecida devolve verdadeiro) e o motor de avaliação — disparado por conclusão de
  tarefa — daria o CAMPEÃO a todo mundo. Quem concede é a rotina, e só ela; o vocabulário de critério com janela
  `temporada` chega na V8-6 (DEC-218/219). (3) O troféu é **vitalício e a concessão é por ano**: a unique
  `(userId, badgeId)` de `user_badges` não duplica a conquista, e a chave
  `GAMIFICATION:SEASON_CHAMPION:<ano>:<pessoa>` na linha de auditoria é a idempotência do ANO — sem tabela nova,
  mesma escolha da revisão semanal de XP. Quem é campeão duas vezes tem um `user_badges` e duas linhas de decisão.
  A linha não declara trilha: `POINTS | COINS | XP` são trilhas de **saldo** e troféu é `user_badges` (a própria
  guarda das trilhas diz isso), então a coluna fica com o default. (4) **Elo nulo por decisão**: a linha nasce com
  `elo` nulo e `position` preenchida pela régua pontos → tarefas → XP → userId; `userId` único torna a ordem TOTAL,
  então o campeão é sempre um só e a hipótese de "conceder a todos os empatados" não é necessária. A escada com
  umbrais (DEC-217) é a V8-6 — antecipá-la aqui seria a V8-6 entrando de contrabando. (5) O campeão é resolvido
  **do livro lido de volta** (`listSeasonStandings`), depois das escritas, não da memória da run: é o que faz uma
  run repetida — ou uma que encontrou metade das pessoas já fechadas — escolher o mesmo campeão da run original.
  (6) `SeasonChampionPort` existe separada do ciclo porque o `AwardBadgeUseCase` tem gate `MANAGE_USERS` e é a
  autoridade de um humano concedendo troféu; acoplá-lo à rotina de sistema (ou abrir exceção no gate dele) era o
  jeito de as duas regras divergirem sem o `tsc` ver.
- **Três decisões de execução da V8-1:** (1) `history.track` é **String** com default, não enum — a
  mesma escolha da DEC-141 (vocabulário fechado no domínio:
  `backend/domain/gamification/tracks.ts`, `POINTS | COINS | XP`); a fechadura é a guarda
  `tests/unit/domain/gamification/gamification-tracks.test.ts`, porque o banco aceita qualquer
  texto e o `tsc` só protege quem importa a constante. (2) Os dois históricos novos são **Cascade**
  (snapshot e livro-caixa são histórico DA PESSOA), então as FKs bloqueantes continuam 18 e a lista
  documentada de cascade do guarda `user-delete-schema-drift.test.ts` ganhou os dois modelos.
  (3) `entities/user.ts` **não** recebeu `coins`/`xp`: nenhuma rota emite as colunas ainda, e campo
  na trilha de wire sem consumidor é exatamente a deriva dormente que a DEC-211 enterrou.
  `TaskCompletedEvent.projectId` ficou no contrato como identidade (é o que distingue quest de tarefa
  de projeto, congelado em teste), só deixou de ser chave de escrita.
- **Três decisões de execução da V8-2:** (1) a contagem de tarefas do mês sai das **duas famílias**
  que hoje creditam `users.completedTasks`, com as MESMAS condições dos dois incrementos medidos
  (`complete-task.use-case.ts:113-119` e `approve-task.use-case.ts:126`): `task_user_progress.completedAt`
  na janela **mais** `tasks.completedAt` do responsável com `isGlobal: false` e
  `taskVisibility != "public"`. Sem o filtro de visibilidade a tarefa pública atribuída entra nas duas
  queries e o número cresce; `tests/integration/monthly-points-reset-roundtrip.test.ts` congela 4 e prova
  o `2 + 3 − 1` consultando o banco. (2) A janela é **fechada nas duas pontas**: o corte de fim é
  exclusivo, o de início inclusivo — a conclusão das `00:00` de 1º/nov (SP) fica FORA de outubro e
  DENTRO de novembro; instantâneo nenhum se perde e nenhum se conta duas vezes. (3) Idempotência em
  duas camadas: o use case lê `hasMonthSnapshot` **antes** de zerar (a zeragem nunca vem atrás de um
  dedup não lido) e o banco garante pela unique `(userId, month)`. O job é testado com o **módulo real
  montado sobre port falsa** (`tests/unit/services/cron-monthly-points-reset.test.ts`) para o gate não
  sumir do teste — a lição medida do B6-2a.
- **O desenho em uma linha:** quatro trilhas com ciclos próprios — **pontos** mensais
  (placar do ranking; reset mensal com snapshot, DEC-212), **XP** e **elo** da temporada
  anual (aritmética nova de volume: +10/+10/+20 por evento, boosts semanais de constância,
  penalidades semanais, piso 0, DEC-214; escada BRONZE/PRATA/OURO/PLATINA/DIAMANTE/
  DESAFIANTE com slots de troféu 0/1/2/2/3/3, DEC-217), **moeda** vitalícia (loja; única
  fonte: atividade de cronograma aprovada, prêmio atual `100 × meses` com a régua
  DEC-103/74 intacta distribuída pela Hamilton, DEC-215) e **troféus** vitalícios (badges
  renomeados na UI; conquistados por critério com janela `mes`/`temporada`/`vida`, pessoa
  equipa até os slots do elo, efeitos com verbos fechados e tiers congelados, DEC-218/219).
- **O que muda de measured:** `users.points` perde o triple-role (vira placar mensal); a
  virada converte saldo 1:1 para `users.coins` (DEC-216); `projects.points` sai do sistema
  junto do publicador `TaskCompletedEvent` (DEC-63) e do campo "Pontos do projeto"; a
  derivação dormente de XP/level/elo em `Progression.ts` (sobre `points`, 4 elos, rota sem
  consumidor de UI) não sobrevive como está.
- **Rotinas novas (todas `systemActor`, DEC-54):** reset mensal `'0 0 1 * *'`
  (`MONTHLY_POINTS_RESET`, idempotente por `(userId, month)` — não herda o QUIRK-7C do
  weekly reset), revisão semanal de XP `'10 0 * * 1'` (`WEEKLY_XP_REVIEW`, idempotente por
  `(userId, weekStart)`), fechamento de temporada `'5 0 1 1 *'` (`SEASON_CLOSE`, livro-caixa
  anual + troféu CAMPEÃO pelo maior somatório de pontos mensais, DEC-213).
- **Status das rotinas novas (medido 2026-10-22):** as três rotinas da gamificação **existem** — reset
  mensal `'0 0 1 * *'` (V8-2), revisão semanal de XP `'10 0 * * 1'` (V8-3) e fechamento de temporada
  `'5 0 1 1 *'` (V8-4), os três em `lib/services/cron-service.ts` agendados logo depois do weekly reset, com
  `executeMonthlyPointsReset()`, `executeWeeklyXpReview()` e `executeSeasonClose()`; as três expressões estão
  pinadas em `tests/unit/services/cron-schedule.test.ts` e os três motivos em `SYSTEM_REASONS`. Consequência de
  sequência e medida até a V8-4: a loja gastava `users.points`, então o fechamento mensal zerava também o
  que tinha sido gasto (a sequência ruim que a V8-4 registrou como consequência aceita). **Fechado na V8-5
  (DEC-215/216):** `prisma-purchase.repository.ts` faz `decrement`/`increment` em `users.coins`, e o guarda
  `tests/unit/domain/gamification/gamification-tracks.test.ts` confere por texto que a loja toca a moeda e nunca
  o placar do mês — as duas colunas são `Int` e o `tsc` aceitaria a errada.
- **Dívida da V8-3 (XP-DUPLICADO) — FECHADA na V8-6 (2026-10-23):** existiam dois "XP". `users.xp` é a trilha
  da temporada, escrita pelo motor; `UserProgression.xp` em `Progression.ts` era **derivado** (`max(0, points)`,
  level `floor(xp/100)`, elos BRONZE/PRATA/OURO/DIAMANTE por faixa de points) e saía por
  `GET /api/users/[id]/gamification`. Depois da V8-2 o segundo zera todo mês junto com `points` enquanto o primeiro
  acumula a temporada. A V8-6 substituiu a derivada: `Progression.ts` ficou com as réguas de premiação e o read model
  `computeSeasonProgression` (`points` do mês + `coins` + `xp` + `elo` + `trophySlots`), a escada é
  `backend/domain/gamification/elo-rules.ts` (DEC-217) e `eloParaXp`/`nivelParaXp` não existem mais no backend (grep
  medido). Consumidor de tela continua não existindo — as telas de troféu e de ranking com elo são a V8-7.

## plan-v5 — documentos oficiais, economia do projeto e perfil (2026-10-13..14)

- **Estado:** `done` — **encerrado em 2026-10-14** (batch `V5-close`, G5/G6: rebuild da imagem, 45 capturas
  do guia, prosa das telas novas, `docs:build`/`docs:check` verdes). Estado/decisões:
  `displayquest-v2/plan-v5/{PLAN.md,STATE.json}` — STATE.json v5.29.0, 35 batches (V5-1..V5-15 com
  sub-batches, mais `V5-9d` de conserto e os fechamentos G5/G6). As decisões do plano são DEC-61..77,
  99..104 e 126..178 (DEC-78..98 do meio são do plan-v4 — houve colisão, ver adiante).
- **O que o plano entregou:** bucket SeaweedFS + anexos/imagens por rota (V5-1..V5-3), dados de pessoa e de
  vínculo (V5-4a/b), cronograma com grade dinâmica e conclusão em duas fases (V5-5..V5-7), atraso urgente
  (V5-8), relatório técnico pelo template oficial + rascunho de IA (V5-9), atestados AcroForm + painel +
  lembrete do dia 19 (V5-10a/b), andamento temporal (V5-11) e visibilidade de perfil como regra de leitura
  (V5-12, DEC-143/178).
- **Gotcha do fechamento (medido 2026-10-14):** as capturas do guia dependem de **dado de vida curta**
  semeado por SQL (atividades "Coleta de dados"/"Revisão da literatura", prova, texto do relatório,
  membership do Guia, tarefa da etapa) e apagado no fim — o botão da linha do cronograma é nomeado por
  **ordem** (`Conclusão da atividade 1` = linha de `order` 1), não pela descrição; o filtro de atividade do
  quadro só renderiza com projeto selecionado **e** atividades no projeto.

## Bucket de objetos (V5-1, 2026-10-13)

- **Servidor: SeaweedFS, não MinIO** (DEC-131). A DEC-101 tinha nomeado MinIO; na execução
  ele estava **EOL** (repo arquivado em 2026-04-25) e as imagens oficiais saíram do Docker
  Hub, do `quay.io` e do `ghcr.io` (`docker manifest inspect` falha nos três). O dono
  escolheu o SeaweedFS. O **escopo** da DEC-101 segue inteiro; só o nome do servidor e o
  prefixo das envs mudaram (`S3_*`, não `MINIO_*`).
- **Serviço:** `seaweedfs` em modo `mini` (master + volume + filer + S3 num processo), imagem
  pinada por **digest** (só existem tags `latest`/`dev`, nenhuma semver),
  `container_name: display-quest-objects`, volume `object_store_data`, healthcheck em
  `http://127.0.0.1:9333/cluster/status`, 8333 intra-rede + `127.0.0.1:8333`/`8888` no
  override. A identidade S3 é escrita em `/tmp/s3.json` no entrypoint a partir de
  `S3_ACCESS_KEY`/`S3_SECRET_KEY` — **nenhuma credencial no repositório** e sem identidade o
  S3 responderia como anônimo. `-master.telemetry=false`. O SeaweedFS exige
  **path-style** (`S3_FORCE_PATH_STYLE=true`).
- **Env por lado:** do host (scripts/testes) `S3_ENDPOINT=http://localhost:8333`; do
  container do `app`, `http://seaweedfs:8333` — as envs **entram** no `app` desde o V5-2c, que é o
  primeiro consumidor de produção (`app/api/projects/[id]/attachments/**`).
- **Seam:** `lib/storage/blob-store.ts` (allowlist de 8 mimes, tetos 5 MB imagem / 20 MB pdf
  / 100 MB vídeo — vídeo é teto provisório, nenhuma tela no plan-v5), port
  `backend/modules/project-management/application/ports/blob-store.port.ts` e adapter
  `infrastructure/adapters/s3-blob-store.ts`. O cliente S3 é **injetável**: a suíte de unit
  roda sem bucket no ar. Magic bytes entraram no V5-2c, na peça única `lib/storage/magic-bytes.ts`
  que os dois seams consomem (DEC-134).
- **Quem move byte (V5-2c, DEC-133):** a **rota** escreve e lê o objeto pelo seam; o módulo guarda
  só o metadado (`blobKey`, nome, tipo, tamanho, quem subiu) e a autorização. O `BlobStorePort`
  **não** está injetado no módulo — os use cases e o roundtrip G4 rodam sem bucket no ar, e a rota
  responde 503 quando `blobStoreFromEnv()` devolve `null` (ambiente sem `S3_*`). É o desenho já
  medido em `project-reports`. Consequência de segurança medida: o gate de gestão roda **antes** do
  corpo ser lido (`AssertCanManageProjectUseCase`) — sem isso, quem não gerencia empurraria bytes
  ao bucket e só depois receberia o 403.
- **Gate:** `docker compose up -d` (qualquer serviço) agora exige `S3_ACCESS_KEY` e
  `S3_SECRET_KEY` no `.env` — `${VAR:?}` falha com mensagem explícita. Desde o V5-2c o serviço
  `app` consome o bucket (anexos de projeto); os roots legados de upload continuam servindo
  avatares e relatórios.
- **Imagem do projeto (V5-2d, DEC-135):** `projects.logoKey`/`bannerKey` guardam a **chave**
  (`projects/<id>/images/<slot>`, slot só `logo` ou `banner` — lista fechada em
  `PROJECT_IMAGE_SLOTS`). O binário sai por `GET /api/projects/[id]/images/[slot]/file`, rota
  autenticada com `Cache-Control: private, max-age=86400`; a tela monta o URL com a chave como
  parâmetro (`?v=<chave>`), porque o endereço por slot é sempre o mesmo e o navegador serviria a
  imagem velha. Só imagem passa: `isImageBlobContentType` lê a allowlist da seam — PDF e vídeo são
  blobs válidos de anexo e não são capa. Trocar imagem apaga o objeto velho, e o use case devolve
  `previousKey` para a rota poder fazer isso.
- **Imagem do perfil (V5-3, DEC-137):** mesmo desenho, aplicado a `users`. `users.bannerKey` guarda a
  **chave** (`users/<id>/images/banner`, slot só `banner` — lista fechada em `USER_IMAGE_SLOTS`), e o
  binário sai por `GET /api/users/[id]/images/[slot]/file`, autenticada. Escrita é a autoridade do
  perfil (`self` OU `MANAGE_USERS`, `PROFILE_DENIED_MESSAGE` = "Não autorizado"), com o gate **antes**
  do corpo do multipart (`AssertCanUpdateUserImageUseCase`); leitura é do autenticado, e a chave chega
  na **mesma lista** que o avatar (`listUsersForActor`) porque é o pódio do ranking que a renderiza.
  O avatar **continua no caminho legado de disco** (`public/uploads/avatars`, WebP 300×300, rota sem
  autenticação) — migrá-lo para o bucket é decisão que ainda não existe. A chave também entra na
  **sessão** (`lib/auth/config.ts`, select do session callback): o cartão "Meu Perfil" vem de
  `useAuth()`, e coluna ausente ali não quebra teste nenhum — quebra a tela.

## Templates oficiais dos documentos (V5-1a, 2026-10-13)

- **`templates/` é asset de LEITURA**, versionado: `relatorio-tecnico.docx` (oficial,
  byte-intacto), `relatorio-tecnico.tagged.docx` (cópia derivada, a que recebe dados no V5-9)
  e `atestado-frequencia.pdf` (AcroForm oficial). O Dockerfile copia a pasta **antes** do
  `chown` de `public/uploads`/`data/uploads`, então ela **não** é gravável — nenhum caminho
  de escrita novo no container. Os originais do dono vivem em `docs/Projeto/` (gitignored).
- **sha256 congelados:** DOCX `70a81240a7de5a661f280b89f2270b3bfb3f1c67048c92882b19e10ce3841f75`,
  PDF `ecba85390adbeaf6559652febea281d7c18ea535c0a94dbfff77d615f9b41757`.
- **A cópia marcada NUNCA é editada à mão.** `npm run templates:tag` a re-deriva do oficial
  (`scripts/tag-report-template.mjs`) e o guarda
  `tests/unit/scripts/report-templates-drift.test.ts` falha se a cópia divergir do que o
  script produz. Os `REPLACEMENTS` têm `expected` por regra: oficial trocado quebra a
  derivação **nomeando o campo**, em vez de marcar menos campos em silêncio.
- **Determinismo do zip (gotcha medido):** o `.docx` oficial **não tem** entrada de diretório
  para `word/` — o `jszip` sintetiza uma no load com `date: new Date()`, e essa é a única
  entrada que varia. Sem normalizar, cada run escreve um arquivo diferente. Cuidado com a
  medição: o timestamp DOS tem resolução de **2 s**, então dois runs seguidos parecem
  determinísticos e não são — o gap de medição tem que ser >2 s. O script normaliza a data de
  todas as entradas, e o guarda compara a data de **cada entrada** com a referência (não
  compara dois runs, então não depende de timing).
- **ARMADILHA CARA — o delimitador do `docx-templates`:** os comandos `{{campo}}` só são
  reconhecidos com **`cmdDelimiter: ['{{','}}']`**. O default da biblioteca é `+++` (medido:
  `listCommands` devolve `[]`) e o par `['{','}']` **quebra** a chave dupla (vira dois
  comandos vazios). O par ancorado está em `CMD_DELIMITER`, em
  `scripts/tag-report-template.mjs` — quem chamar `createReport` no V5-9 tem que passar o
  mesmo. Detalhe de tipo: `listCommands`/`createReport` declaram `template: ArrayBuffer`; o
  `tsc` recusa `Buffer` (TS2345), então copie com `new Uint8Array(buf).buffer`.
- **Os brancos do DOCX são sublinhados literais dentro de um único run** de Times New Roman
  12: a troca reescreve o texto dentro do próprio `<w:t>`, sem tocar `w:rPr`, `styles.xml`,
  `sectPr` nem tema. 13 comandos: `periodo_inicio`, `periodo_fim`, `titulo`, `proppi`,
  `coordenador`, `projeto_inicio`, `projeto_termino`, `orientador`, `estudante_nome`,
  `estudante_curso`, `modalidade`, `instituicao_fomento`, `data_relatorio`. Nomes **sem
  hífen** de propósito (hífen é subtração na expressão da biblioteca); hífen só existe nos
  nomes de campo do PDF (`is_pibic-jr`), onde são literais.
- **O PDF tem 42 campos, não 39** (`16 /FT /Tx` + `26 /FT /Btn`). A DEC-130 e o PLAN diziam
  39; a contagem foi corrigida no V5-1a com `@cantoo/pdf-lib`, e a lista na ordem do arquivo
  está congelada no guarda. `@cantoo/pdf-lib` e `docx-templates` entram **no V5-1a** (as
  guardas precisam delas), não no V5-9/V5-10 como o §5 previa.
- **Dados de exemplo não sobrevivem à cópia marcada:** "Guilherme de Araújo Carneiro" e "Bel
  em Sistemas de Informação" viraram comandos. Quantos relatórios por projeto é o
  `ASK-V5-06` (aberto), mas nome real não sai em documento entregue. A linha de tipo e as 3
  tabelas vazias ficam **sem** marcação de propósito — são V5-9, e somar comando lá obriga a
  atualizar a lista congelada.

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
- **D4 não são 16 rotas — são 41 (medido 2026-10-05, DEC-50) — FECHADO em 2026-10-08 (B6-0..B6-7,
  DEC-115..DEC-123):** as 41 rotas migraram; o gate decide nos use cases lendo o `ActorRef`, e a
  rota autentica, valida entrada, monta o ator e mapeia com `domainErrorResponse`. Restam na rota
  apenas as autorizações **antes do parse** (`AssertCan*UseCase`: notifications B6-2b, schedules/bulk
  B6-6, POST tasks B6-7) — preservam o par medido 403-antes-dos-400 de corpo — e os 400/404 legados
  montados pela rota onde o contrato antigo era verbatim (ex.: 404 do GET issue/daily_log/tarefa).
  Approve/Reject/subtasks de tarefa e lab-event/notice/schedule continuam com id cru de propósito:
  a autoridade já morava nos use cases. O número antigo ("16") e a nota "nenhum use case checa
  ator" estão superados.
- **O cron é chamador sem ator de 3 use cases (medido 2026-10-05) — TODOS aplicados:**
  `lib/services/cron-service.ts` chama `workExecution.listWorkSessions` (×2 com
  `systemActor(SCHEDULED_PAUSE)` + ×1 com `NIGHTLY_SWEEP`, B6-5), `labOperations.pauseResponsibilityForUser`
  (`systemActor(SCHEDULED_PAUSE)`, B6-6) e `reporting.resetWeeklyHoursHistory` (`WEEKLY_RESET`, B6-3).
  A lição permanece: mover checagem para dentro de um use case chamado por rotina **sem** desenhar
  o ator-de-sistema quebra a rotina, e o sintoma não aparece em teste de rota nenhum (DEC-54).
  `work-execution` continua o módulo de wiring mais caro: a factory existe, mas instancia o use case
  *inline por chamada* (`new ListWorkSessionsUseCase(...).execute(query)` nos bindings do módulo) —
  o B6-5 migrou assim, como medido.
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
- **Duas coisas estavam abertas de propósito, e as duas têm decisão hoje:** `GAP-P3-05` — o
  toast da conclusão direta anunciava o número *projetado* em vez do creditado pela resposta;
  **fechado no V4-5c do plan-v4** (DEC-93: o aviso saiu depois da mutação e lê o
  `awardedPoints` da resposta). E o seam `lib/notifications/browser-notifications.ts`
  (134 linhas + teste), **órfão** com a F1b fora do escopo: `grep` mede zero chamadores.
  O dono decidiu **apagar** em 2026-10-13 (**DEC-144**); a execução está no item **D-3** do
  plan-v5 (§4.1), e a notificação nativa continua bloqueada nesta instância — HTTP em IP de
  rede, e o navegador recusa o pedido de permissão fora de secure context.
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

## plan-v4 — subtasks, animação de pontos, inativação de usuário (2026-10-05..10-06)

- **Estado/decisões:** `displayquest-v2/plan-v4/{PLAN.md,STATE.json}` — V4-1, V4-2, V4-3, V4-4,
  **V4-4b**, **V4-4c**, **V4-5a** (subtask no cartão), **V4-5b** (CRUD no diálogo de detalhe),
  **V4-5c** (formulário de nova tarefa + GAP-P3-05 fechado), **V4-6b** (vocabulário de status
  padronizado em `suspended`, fecha ASK-V4-28) e **V4-5d** (G5/G6 do guia, executado 2026-10-07)
  **done**; o plano está **encerrado**. O V4-5d foi a recaptura restrita, sem gravar —
  `capture-user-guide.mjs --only=quadro-tarefas,quadro-tarefas-participante,dialogo-nova-tarefa,
  dialogo-detalhe-tarefa` (exatamente 4 PNGs mudaram; os dois diálogos de `INTERACTIONS` só abrem e
  fotografam; o único que grava é `relatorios-gerar-lote`, fora do `--only`), depois a prosa de
  `docs/src-usuario` pelo manifesto (campo Subtasks na criação, aviso âmbar e checkbox no cartão,
  seção Subtasks + janela no detalhe, trava de entrega + auto-move) e `docs:build` (15 seções técnicas
  / 12 de usuário, 35 figuras) + `docs:check` em verde.
  `awaitingInstruction` está vazia. Em `openQuestions`: **nada** — o **`ASK-V4-33`** foi respondido
  em 2026-10-07 (**DEC-96**): **tirar o filtro** da tela de voluntários (o controle morto saiu, a tela
  fala o vocabulário real e a dívida do guarda ficou vazia).
- **Ajuste pós-encerramento de 2026-10-07 (lote `POS-1`, DEC-97/DEC-98):** cinco mudanças pedidas pelo
  dono depois do `done` — (1) desmarcar subtask atualiza o estado sem refresh manual (cache de listas
  escrito por id em todas as variantes de `queryKeys.tasks.lists()`), (2) **nova regra de pontuação**
  (DEC-97), (3) **marcação exige mãe em Andamento** com toast (DEC-98), (4) lista de subtasks em
  **leitura** + contagem na aba **Tarefas** do painel admin (sem checkbox), (5) o par "subtask"
  duplicado sumiu dos dois diálogos (rótulo/título no topo, placeholder com exemplo
  `Ex.: Revisar a introdução`, botão **Adicionar subtask** virou só-ícone `Plus` com `aria-label`).
- **Numeração de decisão é global e JÁ tem buraco (medido 2026-10-06, atualizado 2026-10-13):** DEC-01..29 clean-arch,
  DEC-30..49 plan-v3, DEC-50..54 B6/D4, DEC-55..60 plan-v4, **DEC-61..77 plan-v5** (commitado em
  `4c6fab7`, criado 2026-10-06), DEC-78..95 plan-v4
  (V4-4, ASK-V4-06, V4-4b, V4-4c, V4-5a, V4-5b, V4-5c e V4-6b), **DEC-96..98 plan-v4 (2026-10-07,
  pós-encerramento: ASK-V4-33 — tira o filtro morto da tela de voluntários — e o lote POS-1 de pontuação
  + trava de marcação)**, DEC-99..104 plan-v5, DEC-105..114 plan-v6 (mais DEC-181..188, a revisão do
  plano em 2026-10-14), **DEC-115..125 clean-arch/B6-restante
  + B9/B10 (encerrado 2026-10-08)**, **DEC-126/127 plan-v5 (2026-10-09: meses marcados na grade do
  cronograma e visualização livre de projetos)**, **DEC-128..130 plan-v5/documentos oficiais (2026-10-13:
  templates viram asset, DOCX preenchido pelo template, AcroForm oficial preenchido)** , **DEC-131 plan-v5
  (2026-10-13, execução do V5-1: o bucket é SeaweedFS, não MinIO — EOL e imagens fora dos registries — e as
  envs são `S3_*`)** , **DEC-132 plan-v5 (2026-10-13, execução do V5-2b: datas do projeto são data civil
  `String` como `createdAt`/`dueDate`, período invertido recusado, e `points` não é escrevível pela rota)**
  e **DEC-133/134 plan-v5 (2026-10-13, execução do V5-2c: no caminho de arquivo do projeto a rota move byte
  e o módulo guarda registro + autorização, com o 403 antes do corpo lido; tabela de magic bytes e nome de
  exibição viram peça única dos dois seams; `project_attachments.uploadedBy` é a 17ª FK bloqueante)**
  e **DEC-135 plan-v5 (2026-10-13, execução do V5-2d: imagem do projeto é lista fechada de slots `logo`/
  `banner`, a coluna guarda a CHAVE do bucket, só mime de imagem passa pela allowlist da seam, e o binário
  sai por rota autenticada com a chave como quebra de cache)**
  e **DEC-136 plan-v5 (2026-10-13, execução do V5-2a: leitura de projeto e das partes dele é do
  autenticado — `canActorAccessProjectDecision` de um parâmetro só; Membros e `/volunteers` abertos a
  pedido do dono; gate de leitura removido das 3 rotas de horas; portas encolheram)**
  e **DEC-137 plan-v5 (2026-10-13, execução do V5-3: capa de perfil no bucket com o desenho do DEC-135 —
  `USER_IMAGE_SLOTS` de um valor, `users.bannerKey` guarda a CHAVE, escrita com a autoridade do perfil e
  o gate antes do corpo, leitura aberta ao autenticado, chave na lista de usuários e na sessão, e o
  avatar continua no caminho legado de disco)**
  e **DEC-138..146 plan-v5 (2026-10-13, rodada de alinhamento pedida pelo dono antes do V5-4: dados de
  pessoa vão todos em `users`, com CPF de leitura restrita (138); relatório técnico por projeto × tipo com
  DOCX gerado uma vez por membro (139); carga horária é coluna do vínculo e PROPPI é `projects.proppiNumber`
  (140); cleanup dos status pré-contrato por migration, sem constraint (141); `backend/models/` encolhe para
  os 6 builders que têm importador (142); visibilidade de perfil vira regra de leitura, batch V5-12 (143); o
  seam `browser-notifications.ts` sai (144); plan-v6 só depois de o plan-v5 fechar (145); CVE do
  `next@15.2.4` registrada sem batch (146))**
  e **DEC-147 plan-v5 (2026-10-13, execução do V5-4a: as listas de pessoa saem dos campos do AcroForm
  medido — `USER_LEVELS`, `SCHOLARSHIP_TYPES`, `FUNDING_AGENCIES` + texto livre `fundingAgencyOther` só com
  `OUTRA`; rótulos ao lado dos tokens no domínio; CPF gravado como 11 dígitos com verificadores validados,
  mascarado só na exibição e fora da sessão; leitura de CPF self OU `MANAGE_USERS`, os demais campos seguem
  a leitura aberta)**
  e **DEC-148 plan-v5 (2026-10-13: o V5-4 foi dividido em V5-4a — `users` + `projects.proppiNumber` + telas
  de perfil/painel/projeto — e V5-4b — `project_members` + tela de membros — pelo tamanho medido, com G5/G6
  rodando uma vez no fechamento do V5-4)**
  e **DEC-149 plan-v5 (2026-10-13, execução do V5-4b: `project_members` ganha `lattes`, `cargaHoraria`,
  `categoria`, `situacao`, `dataEntrada`; `categoria` é `BOLSISTA`/`VOLUNTARIO` vinda dos checkboxes medidos
  do AcroForm e NÃO é segundo vocabulário de papel, `situacao` é `ATIVO`/`INATIVO` com default `ATIVO` e
  remover continua apagando, `dataEntrada` exige forma estrita porque `new Date("01/02/2026")` é 2 de
  janeiro, e quem escreve o vínculo é a ACL do projeto, não `MANAGE_USERS`)**
  e **DEC-150/151/152 plan-v5 (2026-10-13, rodada final antes do dono sair: D-4 é apagar o arquivo morto
  `components/forms/project-members-manager.tsx` (150); as colunas de mês da grade do cronograma são o
  período do projeto, com janela de 12 meses quando ele não tem datas (151); a IA do rascunho tem deploy em
  `localhost:8080/v1` e dev pela tailscale `100.112.10.76:8080/v1`, medido respondendo (152))**,
  **DEC-153..176 plan-v5 (2026-10-14, execução dos V5-5..V5-11: cronograma, tarefa×atividade, conclusão de
  atividade, atraso urgente, atestados, andamento)**, **DEC-177 plan-v5/V5-9d (2026-10-14, conserto do
  rascunho de IA: período por `civilDayOfDate` — createdAt legado ISO; porta `durationHours`)**,
  **DEC-178 plan-v5/V5-12 (2026-10-14, visibilidade de perfil vira regra `canActorViewProfile` consumida
  pela leitura de perfil, lista de usuários e busca de pessoas)**,
  **DEC-179 plan-v5/V5-fix-1 (2026-10-14, conserto pos-encerramento do atestado: CPF sai em 8pt — o
  `/DA` 0 do oficial preenchia a caixa com 23pt; `dia` baixado a 498 para alinhar com o primeiro "de"
  da assinatura — o `ano` fica em 504 porque o segundo "de" está mais alto; folga medida de 1pt nas
  caixas justas da assinatura, "2026" em 8pt e não 7pt)**,
  **DEC-180 plan-v5/V5-fix-2 (2026-10-14, "Gerar DOCX" salva o texto em edição antes de gerar
  quando ele difere do salvo — o servidor gera do conteúdo salvo e o rascunho de IA não salvava,
  daí as tabelas em branco; pipeline DOCX medido íntegro com o conteúdo real do dono)**,
  **DEC-181..184 plan-v6 (2026-10-14, revisão do plano antes de executar qualquer onda: relatórios
  unificados na página de Relatórios com 3 abas e assistente de 3 passos, sem a aba Templates e com o
  atalho preservado no detalhe do projeto (181); a aba Voluntários sai de Projetos e entra no Painel
  Administrativo (182); o detalhe do projeto vira rota `/dashboard/projetos/[id]` com as 5 abas da
  referência e rail direito (183); a aba `settings` do painel admin sai e cada aba passa a dizer o
  motivo quando falta permissão (184))**, **DEC-185..188 plan-v6 (2026-10-14, as quatro perguntas
  abertas respondidas pelo dono na mesma rodada: a rota de Relatórios continua
  `/dashboard/weekly-reports` e só o rótulo vira "Relatórios" (185); a invisibilidade da aba
  Dashboard de Projetos para COORDENADOR/GERENTE é bug e a aba passa à chave nomeada
  `DASHBOARD_PROJECT_MANAGER` = `["COORDENADOR","GERENTE","GERENTE_PROJETO"]` — união, ninguém
  perde o que já via, e é a **única exceção registrada** à regra "nenhum conjunto de papéis muda
  de valor" (186); nomes de terceiros em telas de gestão ficam fora do escopo de privacidade do
  plano, e o CPF segue restrito (187); título do navegador por tela, por efeito no cliente dentro
  do `PageHeader` (`document.title = "<título> · DisplayQuest"`), sem RSC e sem layout por
  segmento, com o fallback de `app/layout.tsx` citando o produto (188)), **DEC-189 plan-v4
  (2026-10-15, lote SUB-1 pós-encerramento: autoridade de subtask — dono ou gestão, nunca
  `MANAGE_TASKS` em bloco; ver o bloco "Subtask" abaixo), DEC-190..210 plan-v7 (MCP de
  validação para o agente consumidor; DEC-205..210 na revisão de 2026-10-21), **DEC-211..220
   plan-v8 (gamificação remodelada, abertas na V8-0 em 2026-10-22: quatro trilhas — pontos
   mensais, XP/elo de temporada anual, moeda vitalícia, troféus equipáveis; mais **DEC-221** (regime de
   execução do plano) e **DEC-222** (ajuste de moeda não aceita saldo negativo), as duas abertas em
    2026-10-22; mais **DEC-223** (data migration do vocabulário de critério, aberta 2026-10-23 na V8-6); mais **DEC-224/225**
    (e2e do quadro: identidade lida da sessão; altura comparada entre dois estados assentados), abertas e executadas
    na V8-7, e **DEC-226** (vocabulário "distintivo" nos capítulos técnicos vs "troféu" na tela), aberta 2026-10-23; ver o bloco
    "plan-v8" abaixo)**. O V4-4 ia usar DEC-61..64 e colidiu; os 28 comentários de código foram
   renumerados. **Antes de abrir decisão nova, `grep`
    os SETE `STATE.json` (clean-arch, plan-v3, plan-v4, plan-v5, plan-v6, plan-v7, plan-v8) — a nota antiga que dizia "três"
    (e depois "cinco") está velha. Próxima livre: DEC-228.**
- **Subtask (V4-4, DEC-78..83 → regra atual = DEC-97/98/189):** tabela `task_subtasks` (sem FK para
  `users` — subtask não tem
  responsável próprio), base gravada em `tasks.points` = `10 + 5·n` (DEC-97) e **cada subtask CONCLUÍDA
  vale +5 fixos dentro dessa base** — a leitura antiga da DEC-78 (subtask pontuada pela regra da mãe no
  instante da própria conclusão; exemplo mãe −40 + (+15, 0, −30) = −55) **morreu na DEC-97**. O prêmio da
  mãe é `(10 + 5·n_concluídas)` atravessando o calendário: **×1,5 se a entrega for ≥2 dias civis
  antecipada** (régua nova, vale para toda tarefa, com ou sem subtask — substitui o "1 dia adiantado" da
  DEC-32), no prazo/sem prazo o base cheio, atraso −10/dia sem piso (DEC-39); fracionário arredondado com
  `Math.round` (25 × 1,5 → 38, congelado em teste). A **trava** (não entrar em `in-review`/`done` com
  subtask aberta, vindo de QUALQUER coluna, nos três caminhos `PUT status` / `PATCH complete` / `POST
  approve`) é 400; a **janela** (criar/renomear/apagar a lista de uma mãe em `in-review`/`done`) é 409.
  A **trava de marcação (DEC-98)**: `completed: true` exige mãe em `in-progress` — 409 com a MESMA frase
  que o toast do cliente (`subtaskMarkMessage`, título "Ação não permitida"); a janela de `done` corre
  **antes**, então `done` responde com a frase da janela; **desmarcar** não é marcar e fica livre fora de
  `done`. Concluir subtask não obedece à janela. A última subtask concluída **move a mãe** de
  `in-progress` para `in-review` com a mesma notificação de um movimento humano.
  **Autoridade (DEC-189, lote SUB-1, 2026-10-15):** marcar e ver a lista pertencem ao **dono**
  (responsável da mãe: `assignedTo` ∪ `task_assignees`) ou à **gestão** (`SUBTASK_MANAGER_ROLES`
  = COORDENADOR/GERENTE/GERENTE_PROJETO, ou líder/criador do projeto). A regra antiga (DEC-82,
  "a mesma de editar a mãe") dava `MANAGE_TASKS` em bloco — e COLABORADOR/PESQUISADOR portam
  essa permissão, então "qualquer um" marcava; membership qualquer do projeto também saiu. A
  MESMA decisão (`canActorOperateSubtasksDecision`, decisão pura no domínio) decide marcar e
  ver: quem não é dono nem gestão recebe a mãe com `subtasks: []` no `GET` e na lista
  (`batchAttachSubtasksForActor`), nunca um 403 que confirma que a lista existe. O gate de
  escopo da mãe não mudou.
- **Excluir usuário não é o caminho (DEC-55):** o que funciona de ponta a ponta é o **bloqueio de
  qualquer status `!== "active"`** — login (`lib/auth/config.ts:30`), API (`lib/auth/server-auth.ts:36`),
  regras de laboratório, bulk weekly reports, cron weekly reset. **Correção medida em 2026-10-06:**
  uma nota anterior aqui dizia que "`inactive` já funciona de ponta a ponta" — meio errado. O status
  `inactive` **não existe como estado escrevível**: o enum é `pending|active|rejected|suspended`
  (`entities/user.ts:31`), a rota de status escreve `active`/`rejected`/`suspended`
  (`update-user-status.use-case.ts:15-18`), e a única ocorrência de `"inactive"` no backend é um
  contador que sempre dá zero (`prisma-user.repository.ts:231`). O caminho real de inativação é
  **"Suspender" → `suspended`** — e em 2026-10-06 o dono decidiu (**DEC-95**, fecha ASK-V4-28):
  padronizar em `suspended`, sem adicionar `inactive` ao enum. A opção "Inativo" do filtro do
  painel, o campo `UserStatistics.inactive` e o contador fantasma **saíram**; os fixtures de teste
  que descreviam `status:"inactive"` (estado que a produção não escreve) passaram a citar
  `suspended`. O `tsc` não pega isso (`inactive` é string), então o guarda é estrutural:
  `tests/unit/modules/user-management/user-status-vocabulary.test.ts` (enum, caminhos de decisão,
  dívida registrada, opção do painel). A dívida era o **`ASK-V4-33`** — a tela de voluntários
  (`volunteers-management.tsx:55`) tinha vocabulário próprio e filtro morto — e o dono respondeu em
  2026-10-07 (**DEC-96**): **tirar o filtro**. O Select de status, o estado `statusFilter` e os
  vocabulários `inactive`/`on_leave` saíram; a tela fala `pending|active|rejected|suspended` e
  `KNOWN_DIVERGENCES` ficou vazio. Nenhuma tela
  `.tsx` chamava `deleteUser`. O `DELETE /api/users/[id]` agora **recusa com 409** quando há
  dependência; sem dependência continua excluindo (é o caso "cadastro de teste").
- **18 das 32 FKs para `users` não declaram `onDelete`** (o default do Prisma; medido 2026-10-22:
  32 FK constraints apontando para `users` na 5433); 10 cascadeiam (`project_members`,
  `task_assignees`, `task_user_progress`, `work_sessions`, `weekly_hours_history`,
  `user_badges.userId`, `notifications`, `certificates.userId` — a 8ª entrou no V5-10a, DEC-170:
  atestado é documento gerado e regenerável, não bloqueia conta — mais `month_history` e
  `season_history`, entradas na V8-1 do plan-v8, DEC-212/213) e 4 são `SetNull` **explícito** no
  schema (três do cronograma, DEC-155, e `certificates.generatedBy`, DEC-170). Nuance medida no
  banco: das 18 sem `onDelete`, as 5 de coluna **nullable** (`projects.leaderId`,
  `tasks.assignedTo`, `tasks.createdBy`, `issues.assigneeId`, `user_badges.earnedBy`) saem como
  `SET NULL` no Postgres; o que o guarda e `countBlockingDependencies` contam é a política da casa
  (409 antes do delete), não a regra que o banco aplicaria. A 17ª bloqueante
  entrou no V5-2c
  (`project_attachments.uploadedBy`, DEC-134 — anexo é dado do projeto, não de quem o subiu) e a
  18ª no V5-7a (`project_activity_files.uploadedBy`, DEC-162 — prova de atividade é dado do
  projeto). Se você
  mexer no schema e adicionar uma FK para `users` **sem** `onDelete`, o guarda
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
- **`set` de pontos aceita negativo (DEC-60, 2026-10-05; corpo novo na V8-5):** o ajuste manual aceita valor
  negativo na trilha PONTOS, porque a premiação produz totais negativos (DEC-39;
  medido: Coordenador −20, Gerente −31030) e a administração não conseguia escrever um de volta.
  `add` (chão em 0 via `Math.max`) e `remove` (exige suficiência) **continuam** não-negativos. A
  rota valida a **ação antes do número** — necessário para saber se o negativo é permitido, e
  inverte a precedência de dois 400. O input do `ModernAdminPanel` tem `min` condicionado à ação.
  Desde a V8-5 o corpo de `PATCH /api/users/[id]/points` é `{ track, action, amount }` (`track` ausente =
  `POINTS`) e a ordem medida passou a gate → id → **ação** → **trilha** → número. A assimetria é a DEC-222: na
  trilha MOEDA nenhuma das três ações escreve saldo negativo, e o `min` do input volta a 0 quando a trilha é
  moeda.
- **Quirk aberto (ASK-V4-06):** `{action:"set", amount: null}` zera o saldo em vez de recusar —
  JSON não tem `Infinity`, `JSON.stringify(Infinity)` é `null`, e `Number(null)` é `0`.
- **`components/admin/ModernAdminPanel.tsx` não tem teste nenhum** (~1000 linhas). Mudança nele é
  coberta só por `tsc`.
- **jsdom não liga StrictMode, o `next dev` liga.** Um efeito que decide se anima a partir de um
  ref que ele mesmo escreve passou verde em 35 testes de jsdom e travou no navegador: no modo
  estrito a primeira passada consumia a diferença e a segunda não animava nada. Renderize em
  `<StrictMode>` quando o comportamento depende de efeito (referência:
  `tests/unit/components/points-catch-up.test.tsx`).
- **Baseline de pontos por pessoa:** `dq:points-seen:<userId>` (`lib/points-seen.ts`, via
  `lib/client-storage.ts`). O contador do cabeçalho parte do último total que aquele usuário viu
  naquele navegador. `clientStorageKey` descarta `null`/`undefined` dos segmentos — sem guarda, a
  chave viraria `dq:points-seen`, uma só para todos os usuários.

## Perfil do sistema (2026-09-05)

- **Papéis e permissões:** `ADMIN`/`COORDENADOR`/`LABORATORISTA` com `MANAGE_WORK_SESSIONS` gerenciam sessões alheias; `MANAGE_USERS` gerencia grade de horários. Voluntário e demais têm leitura liberada onde faz sentido.
- **Projeto: leitura aberta, escrita fechada (V5-2a, DEC-127/136):** qualquer autenticado vê todos os projetos — lista, detalhe, entregáveis, anexos, capa/logo, horas agregadas, **Membros** e horas por pessoa (`/volunteers`). A decisão é `canActorAccessProjectDecision(actorId)` no domínio, de um parâmetro só, e não consulta membership. Gestão continua na ACL congelada (`canActorManageProjectDecision`: existindo membership, só os papéis dele decidem — membership `[VOLUNTARIO]` com `COORDENADOR` global **não** gerencia). Não reintroduza gate de leitura na rota: ele não pode responder "não" e o teste de rota voltaria a congelar o substituto, não o sistema.
- **Dados de pessoa (V5-4a, DEC-138/147):** `users.cpf`/`registrationNumber`/`course`/`scholarshipType`/`fundingAgency`/`fundingAgencyOther`/`level` e `projects.proppiNumber`. As três listas fechadas (`USER_LEVELS`, `SCHOLARSHIP_TYPES`, `FUNDING_AGENCIES`) vêm dos campos do AcroForm medido (DEC-130), com os rótulos ao lado dos tokens em `backend/domain/identity/person-data-rules.ts` — o componente não tem vocabulário próprio (lição da DEC-96), e `normalizePersonEnum` dobra acentos para tela e banco falarem a mesma tabela. Escrita: self OU `MANAGE_USERS`, nos dois caminhos (`UpdateUserUseCase` do painel e `UpdateUserProfileUseCase` do perfil), pela MESMA função `applyPersonDataFields`; `SELF_EDITABLE_USER_FIELDS` passou de seis para treze. Leitura: os seis campos abertos seguem a leitura aberta do perfil (DEC-136) e chegam na lista de usuários; **o CPF é a única exceção** — sai por `toPublicUserWithCpf`, nunca por `toPublicUser`, e na lista só sob `canViewFullUsers`. O CPF **não está na sessão** (cookie): a tela busca em `GET /api/users/[id]/profile`, que decide o direito a cada chamada, e mostra mascarado; gravado como 11 dígitos com os dois verificadores validados.
- **Dados do vínculo (V5-4b, DEC-69/140/149):** `project_members` ganhou `lattes`, `cargaHoraria` (Float), `categoria`, `situacao`, `dataEntrada`. `categoria` é `BOLSISTA | VOLUNTARIO` (nula quando não declarada) e vem dos dois checkboxes medidos do AcroForm (`is_bolsista`, `is_voluntario`) — **não** é um segundo vocabulário de papel: `roles UserRole[]` continua sendo a ACL do vínculo e só `set_roles` escreve papel. `situacao` é `ATIVO | INATIVO`, nunca nula, e **não é o caminho de sair do projeto**: sair apaga a linha (`RemoveProjectMemberUseCase`) e as horas ficam em `work_sessions`. `cargaHoraria` é a carga contratada (alimenta `carga_8`/`carga_20`/`carga_adaptada` do atestado), teto 168 h, e **não é `users.weekHours`**, a meta semanal da pessoa (DEC-140) — os dois coexistem. `dataEntrada` é data civil com forma exigida; `joinedAt` continua o instantâneo. Escrita: `PATCH /api/projects/[id]/members` com `action: "set_profile"`, gate `canManageProjectMembers` (ACL do projeto, não `MANAGE_USERS`), chave `membershipId`, corpo parcial (chave ausente não apaga). Regra pura em `backend/domain/project/member-data-rules.ts`.
- **Perfil: visibilidade prometida, regra ainda não escrita (medido 2026-10-13):** `users.profileVisibility` (`public`/`members_only`/`private`) é gravado na criação, editável na aba Configurações e documentado no guia com três valores, mas **nenhuma decisão no backend o lê** — hoje todo perfil é público de fato, e a leitura de usuário é a do autenticado. Implementar a regra é o batch **V5-12** (**DEC-143**). Enquanto ele não roda, não escreva código que finja aplicar a visibilidade, e não descreva os três valores como comportamento.
- **Kanban:** tema escuro com colunas em cores sólidas por estado (sem degradê), contraste verificado — perfil visual do board é escuro/sólido.
- **Notificações:** painel em popover; fecha ao clicar fora e com `Escape`, acessível por teclado.
- **Grade de horários:** leitura aberta (qualquer autenticado vê todos os horários); escrita/bulk restrita a `MANAGE_USERS`.
- **Sessões de trabalho:** gestor (`MANAGE_WORK_SESSIONS`) vê ativas+pausadas de todos e pode pausar/retomar/finalizar/excluir; usuário comum opera só as próprias. Anti-farm: teto de 9h por trecho ativo e varredura noturna 23:59 (America/Sao_Paulo) fecha o que ficou aberto overnight/weekend.
- **Infra e persistência:** Postgres exposto só intra-rede no compose base; `docker-compose.override.yml` (versionado) adiciona `127.0.0.1:5432` loopback para `psql`/vitest. Volumes de `uploads`/`reports`/`postgres_data`/`object_store_data` persistem entre `--build`/`--force-recreate`.

## Conclusão de atividade, economia do projeto e atraso (V5-7/V5-8, 2026-10-14)

- **Fluxo de duas fases (DEC-76/77/161):** a linha do cronograma (`project_activities`) vai OPEN →
  COMPLETION_REQUESTED (pedida pelo líder OU pela membership de gestor, com pelo menos uma prova
  anexada — `project_activity_files`, DEC-162) → DONE (aprovada por `GLOBAL_PROJECT_MANAGERS`).
  GERENTE **não** aprova o que ele mesmo pediu; COORDENADOR auto-aprova; `requestedBy` nulo
  (SetNull, DEC-155) não gera conflito. O gate da aprovação precisa do `requestedBy`, então na
  aprovação ele corre **depois** do 404 da atividade: 404 projeto → 404 atividade → 403 gate →
  409 status (`activityApproveConflictMessage` por status).
- **Prêmio (DEC-103/74, `backend/domain/project/activity-rules.ts`):** prazo é
  `activityPeriod().periodoFim` (derivado, nunca gravado). Aprovação ≥2 dias civis antecipada →
  `Math.round(base×1,5)`; no prazo → base cheia; atraso → −10%/dia com **piso 0** (`Math.max(0, …)`
  — o piso do projeto é a DEC-74, diferente do caminho de tarefa, sem piso, DEC-39). O dia
  comparado é `civilDayOfInstant(now)` (DEC-132), nunca `new Date()` solto em regra.
- **Distribuição (DEC-104/163/164/165):** crédito do membro = tarefas concluídas do projeto em que
  ele é responsável (`task_assignees`) **ou** completou tarefa pública
  (`task_user_progress.completedAt`), deduplicado por par (membro, tarefa), sem peso. Só membro com
  `situacao ATIVO` no vínculo entra na conta, e o **denominador é a soma dos créditos de quem
  entra** — a leitura literal "tasks do projeto" diluiria o prêmio a zero quando contribuidores
  saíram. Arredondamento é Hamilton de maior resto: floor da parte exata + restos um a um aos
  maiores restos fracionários; desempate (resto, contagem de tasks, menor userId); membro com zero
  tasks nunca recebe resto; **soma das partes == prêmio** em todo ramo, congelado em teste.
- **Ordem das escritas (DEC-165):** prêmios idempotentes por membro (chave
  `GAMIFICATION:ACTIVITY_COMPLETED:<atividade>`; a consulta real do awardHistory é
  `entityId` + `description` — o fake de teste que ignorava o userId escondia colisão entre
  membros da mesma atividade) → **transição de status por último**, o ponto de commit: reexecução
  bate no 409 antes da economia. Falha de crédito vai pro log e não quebra a conclusão (quirk
  congelado do caminho de tarefa). O passo de meio que existia aqui — `projects.points`
  (`projectPointsBalance`, piso 0) — saiu na **V8-1 do plan-v8 (DEC-215)** junto da coluna.
- **Task → `projects.points` (DEC-63) — SUPERADO pela DEC-215 (V8-1 do plan-v8, 2026-10-22):** o
  publicador não incrementa saldo de projeto porque a coluna saiu. `TaskCompletedEvent` continua
  carregando `projectId` **obrigatório** (null = quest global) como identidade do evento, e os três
  call sites de `publishTaskCompletionAward` (complete ×2, approve ×1) continuam passando
  `task.projectId ?? null`; o que não existe mais é a `TaskProjectPointsPort` local (DEC-21) e o
  adaptador compartilhado no composition root.
- **Vocabulário em uma fonte só:** `GamificationSourceType` ganhou `ACTIVITY_COMPLETED` no domínio e
  `gamification/application/contracts.ts` **re-exporta** o tipo do domínio em vez de manter cópia
  (a cópia local de 3 membros era exatamente o modo de falha DEC-95/96). O gamification **não**
  re-aritmética o prêmio: a parte Hamilton chega pronta (DEC-103 — a escala é do domínio de projeto).
- **UI:** o botão "Conclusão" da linha obedece ao par **pedir OU aprovar** (predicate
  `canOpenCompletion` no painel, calculada com as funções do domínio, DEC-92); o diálogo mostra
  "Aprovar conclusão" quando COMPLETION_REQUESTED e o ator pode — quem pediu não vê o botão se for
  GERENTE. A resposta carrega `activity/award/shares/projectsPoints` e a tela não recalcula (R7).
- **Atraso urgente (V5-8, DEC-64/166):** cron diário `'0 8 * * *'` (America/Sao_Paulo) chama
  `projectManagement.notifyOverdueActivities` com `systemActor(OVERDUE_SCAN)` — **não existe rota**
  para o scan de propósito (varredura não é ação de pessoa). A urgência é a coluna
  `notifications.priority` (o painel destaca pela FLAG, não pelo `type`), e a guarda do "uma
  notificação por atividade" é `overdueNotifiedAt`: a marca sai **só depois** da publicação
  bem-sucedida (falha de notificação deixa a linha para o scan seguinte; candidato sem
  destinatário também não é marcado). Audiência: líder + COORDENADOR/GERENTE **ATIVOS**
  (suspenso não recebe, DEC-55), deduplicada. Vencida é `hoje > activityPeriod().periodoFim` —
  o próprio dia do prazo ainda é dentro. O use case lê `users` por adaptador próprio do módulo
  de projeto (RG-04, como `ProjectHoursPort`).

## Relatórios técnicos (V5-9, 2026-10-14)

- **Um texto editável por projeto × tipo** (`technical_reports`, única por `projectId+type`;
  vocabulário `parcial|tecnico-final|final` — a linha de checkbox binária do DOCX, DEC-167).
  Gate de escrita: líder OU gestão do projeto (`canActorManageTechnicalReportDecision`, frase
  congelada "Usuário não tem permissão para editar o relatório técnico deste projeto"); leitura
  é a do autenticado (regra 13). Ordem de recusa medida nos três use cases (upsert/geração/
  rascunho): 404 projeto → 403 gate → 400 tipo.
- **DOCX pelo template oficial** (DEC-128/129/168): a cópia marcada tem 17 comandos
  (`npm run templates:tag`; guarda congela inventário e ordem); o corpo único é distribuído nas
  3 tabelas pelas **linhas de cabeçalho** — `REPORT_SECTIONS` no domínio é a fonte única do
  cortador, do prompt da IA e do adaptador; casamento por linha inteira normalizada, nunca
  substring; seção sem corpo fica vazia. Geração: um documento por membro **ATIVO** do vínculo
  (DEC-139/167), período cortado na geração (DEC-132), chave derivada
  `projects/<id>/technical-reports/<reportId>/<userId>.docx` — a rota move byte ao bucket
  (DEC-133) e o download é leitura aberta (id forjado não acha objeto: 404).
- **Rascunho de IA** (DEC-152/169): prompt construído no domínio (`buildTechnicalReportDraftPrompt`,
  regra de honestidade congelada: só o que tem âncora nas fontes; fonte vazia declarada
  "sem registros"); adaptador OpenAI-compatible por env (`AI_BASE_URL` default
  `http://localhost:8080/v1`, `AI_API_KEY` opcional, `AI_MODEL` default `local`; env VAZA do
  compose conta como ausente — `??` não pega `""`). Falha de IA **não é DomainError**: a rota
  traduz para **502**, não 500 legado. O rascunho não salva e não atropela edição em andamento.
- **Rota Next**: os três filhos de `technical-reports/` usam o MESMO slug `[segment]`
  (gotcha do build, ver "Gotchas reais"); cada handler valida o próprio vocabulário.

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
  lupa — naquela versão `?busca=` só existia depois de clicar em "Buscar tarefas". Se a suíte e2e
  falhar no primeiro teste com *strict mode violation*, suspeite de rótulo duplicado antes de olhar
  o DOM.
- **O buscador do quadro é desktop-first desde 2026-10-05 (`features/tasks/components/board-toolbar.tsx`):**
  a lupa-toggle existe **só abaixo de `sm` (640px)**; no desktop o campo nasce aberto (`h-10`, igual
  aos `SelectTrigger`), a lupa some e o blur nunca recolhe. O que importa ao mexer: **a visibilidade é
  CSS puro** (`sm:w-[200px]` no contêiner, `sm:hidden` na lupa) e o JS via `useIsDesktop()`
  (`useSyncExternalStore` sobre `matchMedia`, `getServerSnapshot` = `false`) decide **só**
  `tabIndex` e o collapse de blur. Renderizar duas subárvores por breakpoint em vez disso duplica o
  `aria-label` "Buscar tarefas por título" no DOM, e no jsdom (sem CSS carregado) as duas ficam
  "visíveis" — o `getByRole("textbox")` acha dois e o teste cai. E a divergência CSS↔JS é o modo de
  falha caro: se o `matchMedia` disser "mobile" e o CSS disser "desktop", o campo aparece aberto com
  `tabIndex={-1}` e **não é alcançável pelo teclado**. `board-people-filter.test.tsx` fixa os dois
  lados — mas note que o **jsdom desta base não tem `window.matchMedia`**, então sem o stub todo
  teste cai no caminho mobile (é o `stubDesktopViewport` do arquivo que escolhe).
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
- **O e2e da worktree não pode reusar o dev server do dono (medido 2026-10-23, V8-7):** na máquina
  o `:3001` é o `next dev` do checkout do dono, rodando OUTRO código, e o `webServer` do
  `playwright.config.ts` tem `reuseExistingServer: true` — apontar o spec ali mediria a árvore errada
  e não diria nada. O que fecha: subir o dev server da própria worktree numa porta livre (a onda usou
  3002) com `DATABASE_URL` na 5433, e um config Playwright temporário com `baseURL` nessa porta
  (`--config`), apagado depois da medição. O e2e da worktree roda contra a 5433 (é a base do plano).
- **Identidade de usuário no e2e: ler da sessão, não escrever no spec (DEC-224, 2026-10-23):**
  `COORDENADOR_ID = 2` era o id do coordenador na 5432 do dono. Na 5433 o coordenador semeado tem outro
  id e os roundtrips G4 criem/apagam pessoas e movem ids, então o primeiro teste do quadro morria em
  `GET /api/users/2` com 404 e o spec serial não chegava aos outros sete. `helpers.sessionUserId(request)`
  lê `/api/auth/session`; o cache precisa ser **por contexto de request** (um `Map` global serviu o id a
  um teste que ainda não tinha sessão no próprio `request` e devolveu corpo sem usuário). Escrever o número
  no spec é a mesma família do erro que a casa já registrou em `ASK-V4-33`: uma segunda fonte de verdade
  para algo que o servidor devolve.
- **Altura de página é leitura assíncrona (medido 2026-10-23, DEC-225):** a asserção `docHeight <
  1,5 x viewport` do cenário AC-P3-06 media o quadro **sozinho** e parou de valer quando a página ganhou o
  feed "Atividade recente" (V6-11k, que tem o próprio `max-h-80`): medido 1590 px com viewport de 720 px,
  antes e depois de dobrar os cartões. Ler a página antes do feed assentar dava 1072 px — a divergência era
  a leitura, não os cartões. O que prova a coluna limitada é a **diferença entre dois estados assentados do
  mesmo quadro** (8 cartões × 16 cartões), não um teto absoluto nem o estado vazio.
- **Apagar as tarefas do e2e não apaga o que elas creditaram (medido 2026-10-23):** o spec do quadro
  cria tarefas `E2E%`, completa-as e a limpeza (`count(*) … 'E2E%'` = 0) confere as linhas. O prêmio do
  catch-up fica em `users.points` e não sai junto. Confira o saldo do coordenador na base de teste e
  restaure-o, senão o próximo lote começa com um placar que não é o dele.
- **O seed pode rodar sem seminar (medido 2026-10-23, V8-8):** `npm run db:test:setup` reportou "Seed
  completa finalizada" com a 5433 no estado que os roundtrips deixaram — 39 pessoas e os badges "Mentor
  da Semana"/"Guardião do Laboratório" de outro tempo. `prisma/seed.ts` chamava
  `createRequire(…)("./seed.dev")` **sem extensão**, e a resolução escolheu o artefato compilado e
  versionado `prisma/seed.dev.js`, que roda o próprio `main()` com o conteúdo de um seed antigo. O `tsc`,
  o lint e o G0 não veem a troca: quem decide é o sistema de arquivos. Conserto (DEC-227): nomear
  `./seed.dev.ts`, com fechadura `tests/unit/prisma/seed-resolution.test.ts`. O artefato continua
  versionado (dívida `SEED-DEV-JS`, remoção é decisão do dono).
- **Captura de tela compartilhando página entra na fila do navegador (medido 2026-10-23, V8-8):** o
  `scripts/capture-user-guide.mjs` reusava uma página por papel, e os fetches do layout (sessões, tarefas,
  projetos, notificações a cada 5 s) continuavam pendurados da tela anterior — medido: 17 requisições sem
  resposta entre 2,7 s e 5,5 s. Com o teto de seis conexões por origem do Chromium em HTTP/1.1 do `next dev`,
  o fetch da tela seguinte nunca saía da fila e a captura fotografava o estado de espera ("Quadro
  indisponível."). Duas correções: **cada captura abre e fecha a própria página** e uma **passada de
  aquecimento por cada rota da execução** (descartada), que tira a compilação sob demanda do caminho. Antes:
  5 falhas em 19 telas; depois: 18 de 18.
- **`innerText` devolve o texto RENDERIZADO, não o texto do fonte (medido 2026-10-23, V8-8):** a tipografia
  da casa escreve as cifras do cartão da temporada em caixa alta (`PONTOS DO MÊS`), e a verificação de tela
  do script comparava caixa exata — falhava por tipografia, não por tela. A comparação do extrato é em caixa
  baixa; o extrato continua gravando a grafia que a tela mostra. Mesma família do `aria-label`: o bloco
  `aria-label="Trilha de saldo"` não entra em `innerText`; o que a tela mostra é o valor do seletor
  (`Pontos do mês`) e a linha `Atual: 1600 pontos · "Definir" aceita valor negativo`. E rótulo que carrega
  contagem ("Aprovações 1") não casa com `exact: true` — o script aceitou expressão regular no campo `aba`.
- **Captura antiga só é descoberta lendo o PNG (medido 2026-10-23, V8-8):** `admin-horas` estava versionado
  do painel anterior à V6-11 — quatro cards de métrica, aba "Badges" e botão "Resetar Semana" — e a prosa do
  guia descrevia essa tela, incluindo "a Visão Geral abre com a tabela semanal de horas", que hoje está na
  aba Horas. Não existe botão de reset da semana: a zeragem é da agenda (`'0 0 * * 1'`,
  `resetWeeklyHoursHistory` com `systemActor(WEEKLY_RESET)`), e o controle medido da Visão Geral é o botão
  **Gerenciar** do card "No laboratório agora". O log do script passou todas essas capturas; só a leitura dos
  PNGs mostrou a divergência.
- **O spec do quadro é `mode: "serial"` e depende do estado do teste anterior (medido 2026-10-05):**
  o teste 3 ("leader approves") só acha o fixture porque o **teste 2** o moveu para `Em Revisão` —
  rodar `-g "leader approves"` sozinho falha na linha 181 (`element(s) not found`) e isso **não é
  regressão**, é o filtro quebrando a dependência. E como é serial, uma falha no 3 faz os outros 5
  aparecerem como "did not run": leia a contagem antes de concluir que cinco testes quebraram.
- **O e2e do quadro quebra por uso manual da instância, não por código (medido 2026-10-05):** o
  teste 3 morre com *strict mode violation* — `Coluna Em Revisão` resolve **2** botões "Aprovar
  tarefa" porque há **mais de um cartão** na coluna. Em 2026-10-05 era a tarefa **id 290 "fasdfas"**
  (`status='in-review'`, `assignedTo=1`), que o dono tinha criado **testando o fluxo de revisão à
  mão** — não é lixo, é uso legítimo da instância. Medido com `git stash` do batch: **o baseline
  falha 3/3 com o mesmo erro**, então nunca é regressão. **Isto é recorrente, não um episodio:**
  sempre que o dono mover uma tarefa para `Em Revisão` testando, o 3º teste quebra de novo e, como
  o spec é serial, os outros 5 nem rodam. O conserto durável é escopar o locator no cartão do
  fixture (como os outros testes do arquivo já fazem, e como o próprio docstring do arquivo promete
  com "Self-contained"); o dono **recusou** em 2026-10-05, então o gate fica vermelho por decisão
  conhecida. Quando o e2e falhar no 3º teste do quadro, **confirme com `git stash` antes de caçar
  regressão** — e o mesmo vale para qualquer coluna: o teste usa a base de verdade, então um cartão
  a mais em `A Fazer`/`Em Revisão`/`Ajustes`/`Concluído` vira strict mode violation da mesma forma.
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
  container = `display-quest-db`) — `db` **não** é o nome do serviço. **Medido em 2026-10-06
  (V4-6b):** ele cria o `PrismaClient()` sem URL própria, então **sem `DATABASE_URL` exportado ele
  cai na 5432** (a instância real) e o caso D-8 falha com *"no purchase row with a current-domain
  status"* — lá `purchases` só tem `delivered`/`processing` (legado). A suíte completa **só fecha
  verde com `export DATABASE_URL=...5433`**; a falha em 5432 é ambiente, não regressão.
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
- **Migration de schema sem pôr a instância em risco (medido 2026-10-06, V4-4):** `prisma migrate dev`
  pode pedir **RESET** quando detecta deriva — e a 5432 é o banco com os dados reais do dono. A sequência
  usada: salvar o `schema.prisma` de antes, `prisma migrate diff --from-schema-datamodel <antes>
  --to-schema-datamodel <novo> --script` (delta offline), gravar como
  `prisma/migrations/<timestamp>_nome/migration.sql`, `prisma migrate deploy` (5432 **e** 5433),
  `prisma generate`.
- **`prisma generate` NÃO alcança processo em execução (medido 2026-10-06):** o `next dev -p 3001` que
  estava de pe desde antes da migration tinha o client antigo em memória — `prisma.task_subtasks` era
  `undefined`, e a primeira chamada da trava devolveria **500 no navegador** com o gate de tipos verde.
  Depois de gerar client, reiniciar o dev server antes de rodar e2e.
- **Reconstruir o `app` para o G6 leva mais de 25 minutos (medido no V5-2d):** o `docker compose
  build app` roda `npm i` nos dois stages e depois `next build`. Um timeout de shell padrão mata o
  build no meio e a imagem continua a antiga (`docker images` mostra a data velha). Rodar em
  background com `--progress=plain > log`, e conferir a data da imagem antes de recapturar. O
  container em pé tem o Prisma client e as rotas da imagem, não do working tree.
- **zod com `.default([])` torna a chave OBRIGATÓRIA no tipo de saída (medido 2026-10-06):** `entities/task.ts`
  aceita `subtasks` ausente no *wire*, mas `Task` (saída de `z.infer`) passa a **exigir** a chave — todo
  literal de `Task` (ex.: `tests/mocks/fixtures/tasks.ts`) precisa dela. Tolerância de parse não é
  tolerância de tipo.
- **Assinatura de regra de pontuação: `completed` é obrigatório de propósito (medido 2026-10-06).**
  `AwardableSubtask` com `completed?` opcional fez a primeira versão contar subtask **aberta** no prêmio e
  passar verde em todos os testes, porque os objetos de teste não diziam nada. Verificado por mutação
  (remover o filtro não derrubava teste nenhum) e corrigido: campo obrigatório + caso explícito
  "subtask aberta não entra na conta".
- **`tests/unit/domain/identity/system-callers.test.ts` monta use cases de task à mão** com fakes `as never`:
  um port novo (`subtasks`) não é pego pelo `tsc` e aparece como crash em tempo de execução. Precisa de
  `subtasksPort()` (`countOpenByTaskId → 0`).
- **A causa aparente da falha conhecida do 3º teste do quadro mudou (2026-10-06):** em 2026-10-05 era a
  tarefa 290 "fasdfas"; agora é a **50 "fazer reuniao com mamedes"**, que o dono moveu para `in-review`.
  É o mesmo modo de falha previsto acima (um cartão a mais na coluna → *strict mode violation*), e o
  `git stash` confirma que o baseline falha idêntico.
- **Rejeição não tratada em `onClick` quebra o GATE, não só o console (medido 2026-10-06, V4-4b):**
  um `async` handler que lança sem `catch` devolve promise rejeitada que o React não trata. O Vitest
  desta casa reporta `Unhandled Rejection` e sai com **exit 1** mesmo com todos os testes passando —
  `Test Files 1 passed / Tests 9 passed / Errors 1 error`. Referência do conserto:
  `components/admin/ModernAdminPanel.tsx` (`userSettingsError` + `<p role="alert">`, DEC-85).
- **`ModernAdminPanel` não renderiza sozinho (medido 2026-10-06):** monta `ManageWorkSessionsDialog`
  e `UserApproval` sempre, e os dois chamam contexto no primeiro render. Precisa da stack real do app
  (`UserProvider > ProjectProvider > WorkSessionsProvider`, `app/client-layout.tsx:26-34`) e de mock de
  `useAuth` — sem ele `canManageUsers` é `false` e a aba de usuários renderiza vazia, e o teste passaria
  provando o oposto do que pretende.
- **jsdom não implementa `window.confirm`** (lança "Not implemented"). Botões que confirmam antes de
  chamar a API ("Suspender", "Rejeitar") precisam de `vi.stubGlobal("confirm", vi.fn(() => true))`.
- **Texto montado em vários nós não é encontrável pela frase inteira:** `Atual: {n} pontos` + a dica da
  ação viram três nós, e `getByText("Atual: 120 pontos")` falha com "text is broken up by multiple
  elements". Caminho: regex no nó do parágrafo (`getByText(/Atual: 120/)`).
- **`userEvent` sem `userEvent.setup()` é lento sob carga — flake medido (2026-10-06, V4-6b):**
  chamar `userEvent.type/click` direto usa `delay: 0`, e **cada tecla vira um `setTimeout(0)`**. O
  caso "a mãe nasce com a lista e com a base 10 + 5·n" (`task-dialog-subtasks.test.tsx`) estourou
  **5041 ms** numa corrida completa da suíte, verde isolado e no rerun. Correção: `userEvent.setup({
  delay: null })` criado no `beforeEach` e usado como `user.type/user.click` — padrão já usado em
  `task-board.test.tsx`. Suspeitar disso quando um teste de digitação falha **só** sob carga paralela.
- **Dois vocabulários de status de usuário convivem nesta base (medido 2026-10-06; o do caminho de
  decisão saiu no V4-6b/DEC-95):** o do modelo é
  `pending | active | rejected | suspended` (`entities/user.ts:31`), e é isso que a rota escreve
  (`update-user-status.use-case.ts:15-18`). `inactive` aparecia em regras, testes, filtros da UI e num
  contador de estatística (`prisma-user.repository.ts:231`, sempre 0), mas **nenhum caminho escreve
  esse status** — as regras só chegam nele porque testam `!== "active"`. DEC-95 tirou `inactive` do
  filtro do painel, do campo de estatística e dos fixtures; o guarda
  `tests/unit/modules/user-management/user-status-vocabulary.test.ts` segura o caminho estrito.
  `components/features/volunteers-management.tsx:55` tinha um terceiro vocabulário
  (`active | inactive | on_leave`) e um filtro que nunca casava — **fechado em 2026-10-07**
  (**DEC-96**): o dono mandou **tirar o filtro**, a tela passou a falar o vocabulário real e o guarda
  ficou com dívida vazia. Na instância real: 10 usuários,
  todos `active`.
- **`SelectTrigger` do Radix com só `<SelectValue placeholder=…>` não tem nome acessível (medido
  2026-10-06):** `getByRole("combobox", { name: "Status" })` não acha. Precisa de `aria-label` no
  trigger. Mesma classe do botão-ícone do painel (DEC-86).
- **`Select` do Radix não aceita `""` como valor (medido no V5-4a):** campo nullable usa sentinela
  própria (`NO_VALUE = "none"` no painel e no formulário de perfil) e vira `null` no submit. Sem a
  sentinela o Select nasce sem valor e o `onValueChange` nunca roda — o campo parece morto.
- **Fake de repositório tem que devolver CÓPIA na leitura (medido no V5-3 e de novo no V5-4a):**
  `findById` devolvendo o objeto vivo do Map faz a falha do `update` parecer sucesso, porque os use
  cases mutam o record antes de gravar. O sintoma é o caso de compensação ficando verde.
- **Store de mock semeada por versão só existe depois da primeira port chamada (medido na V8-6,
  `tests/unit/api/trophy-equip-routes.test.ts`):** o `vi.mock` do factory ressemeia a store quando a
  versão muda, então escrever XP/saldo no Map pelo lado do ANTES da primeira chamada é escrever num
  objeto que a própria chamada substitui — o caso "slot cheio" ficava verde com o XP errado (BRONZE
  com 900 XP). Caminho: a re-semeadura expõe um ajuste (`mocks.setXp`) que primeiro semeia e depois
  escreve. O reverso também é prova: se o gate bloqueia antes de qualquer port, a store nem é semeada,
  e `writes` vazio diz mais do que checar o estado do troféu.
- **Os métodos do módulo misturam chamada por posição e por objeto (medido no V5-4a):**
  `updateUserProfile(actor, userId, data)` e `findUserById(actor, userId, deniedMessage)` são por
  posição; `updateUserImage({ actor, userId, slot, blobKey })` e `listUsersForActor({ actor })` são por
  objeto. O `tsc` não pega a troca porque o retorno é `unknown` — o roundtrip G4 é onde aparece.
- **`vi.fn(() => true)` tem `mock.calls` tipado como tupla vazia:** acessar `mock.calls[0][0]` dá
  TS2352 + TS2493. Forma correta: `vi.fn<(message?: string) => boolean>(() => true)`.
- **Filtro da lista de usuários do painel NÃO se aplica ao `ScheduleGrid`** (medido 2026-10-06): ele
  recebe a mesma lista e renderiza inteira. Provar "o filtro escondeu o usuário" exige escopo num
  controle que só existe na lista filtrada (o teste usa `Configurar <nome>`).
- **Sonner só chega ao DOM se `<Toaster/>` estiver montado — e montar exige `matchMedia` (medido
  2026-10-06, V4-5a):** nenhum teste antigo do quadro monta o Toaster, então nenhum prova texto de
  toast. Montado no jsdom, ele explode com `window.matchMedia is not a function`. O stub precisa ser
  **local ao teste**: um shim global em `tests/setup.ts` faria `useIsDesktop()` do quadro responder em
  todos os testes, que hoje caem no caminho "mobile" justamente porque não há `matchMedia`.
- **Mock que reimplementa a regra pode ficar verde com a produção mentindo (DEC-90, 2026-10-06):**
  `tests/mocks/handlers.ts` agora aplica trava, janela e auto-move com as funções do domínio
  (`openSubtasksCount`, `openSubtasksMessage`, `subtaskWindowMessage`, `SUBTASK_BLOCKED_TARGETS`,
  `SUBTASK_EDITABLE_STATUSES`). Por isso `subtaskWindowMessage` foi movida de
  `internal/task-view.ts` para o domínio: importar interno de módulo para o mock dizer a mesma frase
  seria a regra em duas cópias.
- **Mudar a regra pura já desabilita o menu (medido 2026-10-06, V4-5a):** `allowedTargets` é
  derivado de `resolveMove`. Quando a trava de subtask entrou em `resolveMove`, o menu "Ações para …"
  parou de oferecer Em Revisão/Concluído sem o cartão mudar uma linha — 4 testes vermelhos na função
  pura bastaram. E a ordem importa: o `remap-to-review` (não-líder → "Concluído" vira Em Revisão)
  precisa vir **depois** da trava, senão a UI oferece o movimento e a trava vira toast em vez de
  botão desabilitado.
- **Porta de autoridade da UI: medir a do servidor antes de escrever o gate (DEC-92, 2026-10-06):**
  em `task-detail-dialog.tsx`, `canManageTasks` **já era** exatamente a lista de `MANAGE_TASKS`
  (`backend/domain/identity/permissions.ts:22`), e o servidor aceita `MANAGE_TASKS`/`MANAGE_USERS` **ou**
  responsável **ou** criador/líder/membro do projeto (`internal/task-view.ts:208-216`). A UI oferece as
  duas portas que tem; as duas de projeto exigem consulta que o diálogo não faz, e o 403 do servidor
  chega na tela.
- **Caractere não latino também aparece no CÓDIGO, não só nos docs (medido 2026-10-06):** um
  comentário de `task-detail-dialog.tsx` tinha `aвариado` (cirílico). `docs:check` não cobre código.
  Caminho: `grep -rn "[а-яА-Я]" backend features components lib app tests entities contexts`. Uma
  ocorrência na base inteira, corrigida no V4-5b.
- **O aviso da conclusão chega depois da resposta (DEC-93, 2026-10-06):** o cartão calculava
  `projectedAward(task)` e anunciava esse número **antes** da mutação. Hoje anuncia o `awardedPoints`
  da resposta, depois dela — e os dois divergem (medido: pública vencida há 3 dias projeta −20, a
  resposta credita 10). Consequência para teste: o cartão já se moveu (otimista) quando a frase aparece,
  então o toast se prova com `findByText`, não `getByText`. A frase é `completionAwardMessage`, uma cópia
  só para o menu do cartão e o soltar do arrasto.
- **Mock que ignora uma chave do corpo esconde defeito do cliente (medido 2026-10-06, V4-5c):** o POST
  `/api/tasks` do mock não tratava `subtasks`, então o teste do formulário passaria verde provando que o
  input existia. Agora ele espelha a rota real: `normalizeNewSubtasks` (400 se inválido), linhas com id
  e base `10 + 5·n`.
- **"Quest Global" do formulário é um `Switch` do Radix (`role="switch"`), não uma checkbox** (medido ao
  escrever o teste do V4-5c). O teste que buscava `getByRole("checkbox", { name: "Quest Global" })` falhava
  por isso, não pela regra.
- **Nunca imprimir/commitar o valor real do `NEXTAUTH_SECRET`** do `.env` local.
- `tests/` é versionado por negações no `.gitignore` (`tests/*` + `!tests/unit`,
  `!tests/integration/**` etc.; screenshots de e2e continuam ignorados) — os testes
  fazem parte do commit desde `7155b92`.
- **Lint em git worktree falha (config-cascade):** o app é desenvolvido em worktrees em
  `.worktrees/`. Como worktree é dir aninhado, o ESLint conflita config-cascade
  (`.eslintrc.json` local vs `../../.eslintrc.json` do repo pai, exit ≠ 0 só em worktree).
  No repo pai `npm run lint` passa (exit 0, só warnings). **Workaround validado:** validar
  sempre com `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` (exit 0 limpo).
- **`npx vitest run --project unit` / `--project=integration` não funciona nesta versão do Vitest**
  (medido 2026-10-22, V8-2): "No projects matched the filter", apesar de `vitest.config.mts` declarar os
  projetos com esses nomes. A divisão canônica unit×integração se mede por **subtração**: `npx vitest run`
  menos `npx vitest run tests/integration` — e a conta deve bater com a aritmética do lote de arquivos
  criados, que é a prova de que os dois números são do mesmo escopo.
- **Enviar env para vitest em worktree:** o runner lê `process.env`, não `.env`, e o `.env`
  tem aspas nos valores. Exportar com `set -a; source .env; set +a; npx vitest run` (o
  `grep/cut` sem aspas também funciona).
- **Data civil `YYYY-MM-DD` não se renderiza com `new Date` (medido no V5-2b, DEC-132):**
  `new Date("2026-10-13")` é meia-noite UTC e `toLocaleDateString("pt-BR")` devolve **12/10**
  no fuso do laboratório. Campos de data do schema que são data civil (`projects.createdAt`,
  `tasks.dueDate`, `projects.startDate`/`endDate`) se formatam por substring, e a aritmética é
  a de `backend/domain/time/civil-day.ts`. Gravar o instantâneo que o `<input type="date">`
  produz reabre exatamente o erro que o plan-v3 fechou.
- **`civilDayOfDate` aceita o que `new Date()` aceita — e `new Date("01/02/2026")` é 2 de janeiro
  (medido no V5-4b):** texto com barra cai no parser do `Date`, que lê mês/dia/ano. Sem exigir a
  forma, `01/02/2026` virava `2026-01-02` gravado em silêncio. `normalizeMemberEntryDate`
  (`backend/domain/project/member-data-rules.ts`) exige `YYYY-MM-DD` ou instantâneo ISO e recusa o
  resto nomeando o campo. O caminho do projeto (`normalizeProjectDateField`, V5-2b) **mantém** o
  comportamento congelado: nenhuma tela produz essa grafia hoje, e endurecer lá exige mexer em
  `validateProjectInput` e nos testes congelados do V5-2b.
- **A garantia "nada é gravado a meias" é do chamador, não da função de normalização (medido no
  V5-4b):** `applyMemberProfileFields` e `applyPersonDataFields` mutam campo a campo, então um corpo
  com a metade errada deixa a outra metade mutada NO OBJETO. O que evita a escrita a meias é o use
  case: ele mergeia sobre cópia do record e só chama `update` depois da função retornar. Ao escrever
  o teste, prove a garantia no use case — provar na função pura é provar o que ela não promete.
- **MSW não serve upload neste ambiente (medido no V5-2c):** o `fetch` que o Vitest injeta no jsdom
  é o do undici, e ele **não serializa** um `File` do jsdom dentro de um `FormData` —
  `multipartFormDataParser` falha com `assert(typeof value === "string" && webidl.is.USVString(value)
  || webidl.is.File(value))` antes de qualquer handler chegar. O teste de painel de anexo usa um
  `fetch` gravador (`vi.stubGlobal("fetch", …)`) que inspeciona o `FormData` direto — prova campo
  `file`, nome e tipo do arquivo. O multipart de verdade fica congelado no teste de rota
  (`tests/unit/api/project-files-routes.test.ts`), que exercita a rota com `NextRequest.formData()`.
- **`user.upload` respeita o `accept` do input e descarta em silêncio (medido no V5-2d):** um PDF
  enviado a um input com `accept="image/png,image/jpeg,..."` não lança erro e **não dispara
  `change`** — nenhum handler roda, nenhuma requisição sai. Então teste de UI não prova recusa de
  mime pelo servidor: prova a lista de aceitação do campo. A recusa do servidor fica no teste de
  rota. O caso que a tela prova é o que o `accept` deixa passar e o seam recusa (PNG declarado
  como JPEG).
- **Rotas Next 15 recebem `{ params: Promise<…> }` (medido no V5-2c):** chamar o handler com um só
  argumento no teste dá `Cannot read properties of undefined (reading 'params')`, e o
  `routeErrorResponse` transforma isso em **500** — os 21 casos do arquivo ficaram vermelhos com
  "expected 500", que não diz nada do problema. Monte `{ params: Promise.resolve({...}) }` num helper
  **genérico** (`<T extends Record<string,string>>`), senão o `tsc` recusa o `Record<string,string>`
  no lugar de `{ id: string }`.
- **Next 15 recusa slug diferente na mesma posição de rota dinâmica (medido no V5-9b, 2026-10-14):**
  `technical-reports/[type]/generate` e `technical-reports/[reportId]/file` quebraram o
  `next build` com "You cannot use different slug names for the same dynamic path
  ('reportId' !== 'type')" — `vitest`, `tsc` e `arch:check` passam verdes e **só o build** falha,
  o que deixa o erro chegar no `docker compose up --build`. Conserto: um slug só (`[segment]`)
  nos dois filhos, e cada handler valida o próprio vocabulário (tipo contra a lista fechada do
  domínio; id numérico).
- **Bytes de controle entram num arquivo novo pelo caminho da escrita, não pelo código (medido no
  V5-2c):** `\u0000-\u001f` escrito dentro de uma string JSON vira caractere **real** no arquivo
  gravado, e o `grep` passa a tratar o `.ts` como binário ("Binary file matches"). Conferir por
  contagem de bytes `< 32` no arquivo; `JSON.stringify` da linha não serve de prova, porque re-escapa
  o que está cru.
- **Select do Radix dentro de `<form>` apaga valor pré-selecionado sozinho no jsdom (medido no
  V5-6):** o Radix renderiza um native select oculto (`BubbleSelect`) quando o `Select` está dentro
  de um form, e as opções dele só existem quando a lista abre. Um valor controlado sem opção
  registrada é desaguado em `""` e dispara `change` — a pré-seleção da atividade no formulário de
  tarefa sumia sem nenhum clique. O guarda: o `onValueChange` ignora `""` (a sentinela da casa é
  `none`, nunca `""`). Fora de form o artefato não aparece — por isso a toolbar do quadro não
  sofre dele.
- **`NuqsTestingAdapter` sem `hasMemory` desfaz param recém-escrito sob carga (medido no V5-6):**
  no adapter de teste, `updateUrl` só atualiza o snapshot da URL quando `hasMemory` está ligado;
  com o default `false`, a rajada de seis setters da barra do quadro chega a flushar contra a base
  antiga e o param volta ao valor velho — verde isolado, vermelho na suíte paralela. O teste do
  filtro de atividade usa `hasMemory` + `rateLimitFactor={1}`; ainda assim o estado final da rajada
  assenta assíncrono, então o contrato do "Limpar filtros" é provado na toolbar (corpo `{}`), não
  pela URL.

## Documentação (docs/)

- **Dois documentos, ambos gerados** (nenhum editado à mão): `docs/displayquest.html` (técnico:
  `docs/src/*.md` + `docs/diagrams/*.puml`, 15 capítulos / 33 figuras UML, ~1 MB) e
  `docs/guia-do-usuario.html` (guia de uso: `docs/src-usuario/*.md` + `docs/screens/*.png`,
  12 capítulos / 44 capturas, ~8 MB). Compartilham `docs/theme/document.css`. `npm run docs:build`
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
- **Captura que passa no script pode estar fotografando a tela errada (medido no fechamento do V5-4):**
  as verificações do script olham texto no **documento**, não o que está no campo de visão. Três modos
  medidos: (a) abrir um botão cujo alvo está em **outra aba** — `perfil-edicao` clicava "Editar Perfil"
  com a aba Atividade ativa, o formulário (que mora na aba Configurações) ficava fora da foto e o
  extrato media **zero** `label`; (b) o bloco que importa fica abaixo da dobra — entrou
  `rolarAte: "text=<rótulo>"`, que leva o elemento ao campo de visão antes da foto; (c) o balão
  "Bem-vindo(a)!" tapa rótulos do lado esquerdo — o script escreve `session-welcome-balloon-dismissed`
  no `sessionStorage` no `addInitScript`, que roda antes dos scripts da página. O guarda é **ler os
  PNGs**, não só o log do script.
- **O extrato do DOM não vê controle só de ícone:** `some("button", 80)` descarta texto vazio, então um
  botão com só `aria-label` (ex.: `Configurar <nome>`, do painel) não aparece no `manifest.json`. Quando
  o guia nomeia um controle assim, a medida vem do código/teste, e a prosa tem que dizer isso.
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
- **Cartões de teste manual na instância real:** o dono testa os fluxos pela mão, e o que sobra fica
  visível no quadro e **versionado nas capturas do guia** — tarefas "rewqr" (×3), "asfsa" (×2),
  "asdasfasd", "321321", "sfdasadf", "fdsafdsa", "sfddsfa", "afsdasd", "fasdfas" (id 290) e o projeto
  "asdfasdf". **Não é lixo a limpar** (confirmado pelo dono em 2026-10-05): é uso legítimo da
  instância, e por isso **persiste**. O que pesa de verdade: a tarefa 290 está com
  `status='in-review'` e é o que **derruba o 3º teste do spec e2e do quadro** por *strict mode
  violation* (dois botões "Aprovar tarefa" em `Em Revisão`). Conferido com `git stash`: o baseline
  falha igual, então não é regressão — e o dono decidiu **não** escopar o locator nem mexer no dado
  (ver a nota de e2e em "Gotchas reais"). Se isso incomodar nas capturas, a saída é recapturar, não
  apagar dado.

## Sons de alerta (lib/notifications/alert-sound.ts) — troca de sintetizado para arquivo

- **O som é arquivo MP3 em `public/sons/`, não oscilador.** Medido em 2026-10-09: o dono
  recusou três volumes de um bip sintetizado (0.16, 0.35, 0.75) e depois recusou um "plim"
  de oscilador que subia de 1046 Hz a 1568 Hz. A lição: nesta casa, gosto de som se discute
  com arquivo gravado, não com `GainNode`. Os dois arquivos vêm do Mixkit (Mixkit License,
  uso livre sem atribuição) e a origem de cada um está em `public/sons/LICENSE.md`.
- **`isAlertSoundSupported()` hoje mede `typeof Audio`, não `AudioContext`.** Isso muda o
  comportamento no jsdom: `Audio` existe lá e `AudioContext` não. Consequência medida: o
  botão de informação do som passa a renderizar em teste, e o rótulo "Como funciona o som
  ao pausar" casa com `/pausar/i` — o teste
  `features/laboratorio/__tests__/floating-timer-tabs.test.tsx` precisou de
  `{ name: "Pausar", exact: true }` (a lição do substring valendo de novo).
- **Som ligado por padrão, os dois**, por decisão do dono no mesmo dia. As chaves
  `dq:som-pausa` e `dq:som-quest` guardam a preferência; os interruptores vêm depois.
- **O contador de notificações não era instantâneo** (eu medi achando que era): as queries
  de `features/notifications/hooks/use-notifications.ts` repetiam a cada 60 s e o
  `refetchOnWindowFocus` global está desligado. Para o som de notificação ter sentido, a
  contagem passou a repetir a cada 5 s (`NOTIFICATION_POLL_MS`); a lista completa segue em
  60 s. O som nasce da SUBIDA da contagem, nunca da primeira leitura.

## Painel admin — quadro de horas restaurado e fila de aprovação (V6-11h/i, 2026-10-17)

- **`sr-only` dentro de scroller estica a PÁGINA com espaço vazio (medido no V6-11h).** O span
  `sr-only` das subtasks (aba Tarefas do `ModernAdminPanel`) é `position:absolute` e, sem
  ancestral positioned, tem containing block na RAIZ do documento: os spans escapam do corte do
  scroller `max-h-[480px] overflow-y-auto` e entram no overflow do `html` — a página media
  **5899px de altura** com 1px de elemento invisível espalhado (a "barra de rolagem gigante, mas
  todo o espaço é vazio" que o dono relatou). Provado por experimento no Chromium: `overflow:hidden`
  NO scroller **não** resolve (containing-block escape ignora clipping), `contain:paint` **resolve**
  (vira containing block + recorta), e `position:relative` no `<li>` dono do span resolve
  (página volta a 1258px). Regra: `sr-only` (ou qualquer absolute) dentro de lista rolável exige
  ancestral `relative`; o jsdom não vê isso — só browser real.
- **O quadro por semana do painel voltou (`WeeklyHoursTable`, wire em `ModernAdminPanel` aba
  Horas):** navegador `‹ Hoje ›`, semana atual das sessões, semanas passadas via
  `GET /api/weekly-hours-history?weekStart=` (fallback `POST create_week_history`), colunas
  Nome/Email/Horas trabalhadas/Meta/Estado contra `users.weekHours`
  ("Yh restantes" vermelho, "+Xh extra", "Meta atingida!", "Sem meta definida" quando a meta é 0).
  `AdminHoursManagement` (relatório por período) continua abaixo dele.
- **A aba Tarefas abre como fila de aprovação (decisão do dono, V6-11i):** `taskStatusFilter`
  default é `in-review`, não `all` — medido 0 em revisão na instância (44 done / 28 to-do), então
  "all" mostrava 72 tarefas de estoque sem nenhum botão Aprovar/Rejeitar. As demais listas
  seguem pelo mesmo Select. Caracterização em
  `tests/unit/components/admin/tasks-tab-queue.test.tsx`.
- **Gotcha de teste: `combobox[0]` do painel NÃO é o filtro de status** — o Select "Exportar"
  do cabeçalho do painel vem antes no DOM e seus itens são `role="option"` (Usuários/Projetos).
  Escopo pelo `textContent` do valor selecionado ("Em Revisão"). E a lista de opções do Radix
  aparece um frame depois no jsdom (`findByRole` com timeout) e está com `pointer-events:none`
  durante a animação — selecionar opção com `fireEvent.click`, não `userEvent`.

## Cronograma — "fixa em 12" não reproduz (V6-11j, DEC-204, 2026-10-17)

- **A regra do dono para a grade já está em produção** (DEC-151, `cronogramaMonthColumns`): com datas,
  as colunas são o período do projeto inclusivo (delta mensal com ceil ≈ contagem de meses marcados);
  projeto de 6 meses → 6 colunas (medido no wizard), projeto ago/nov-2026 → 4 colunas de período.
- **O 12 que o dono viu é o fallback de projeto SEM datas** — janela de 12 meses ancorada no mês atual
  (`CRONOGRAMA_FALLBACK_MONTHS=12`), e todos os projetos de exemplo da instância estão sem datas.
  Medido por API: projetos 2/10/1 = 12 colunas (out/2026…set/2027); projeto 7 = **14** (as marcas de
  atividade que vão além do fim alargam a janela até set/2027). Nenhuma tela hardcodiza 12.
- **Decisão do dono (DEC-204): manter o fallback de 12** quando o projeto não tem datas. Nenhuma
  mudança de código; a regra DEC-151 permanece intacta. Quem esbarrar nesse pedido de ajuste de novo:
  é o fallback, não um bug.
- **Gotcha de medição:** o Cronograma do detalhe do projeto mora na aba **Tarefas** (primeira peça do
  `TabsContent value="tasks"`, `page.tsx:192`), não numa aba própria — para medir as colunas, entre
  no projeto, clique "Tarefas" e conte os `th` com padrão `^[a-z]{3}/\d{4}$`.

## Rodapé discreto, feed de altura fixa e limpeza diária do feed (V6-11k, 2026-10-18)

- **Rodapé (commit `e18e97b`):** versão discreta do dono — SÓ as logos em um canto
  (`LOGO.png` do Lab em `h-6` + reserva pontilhada "Logo IFNMG") e o crédito
  ("Desenvolvido por Márcio Martins Ferreira Júnior") na outra ponta; o nome do instituto
  e o campus (Januária, NÃO Salinas — correção do dono) moram só em `title`/alt, visível
  em nenhum texto. A aba "Sobre o Projeto" foi perguntada e o dono recusou ("Não fazer"
  — o rodapé acabou de ganhar chrome, não recebe mais).
- **Feed "Atividade recente" da Home:** lista com `max-h-80 overflow-y-auto` — o card
  cresce para dentro do quadro, nunca para fora (o dono temia "monstruosidade"
  com logs acumulando). Teto 320px; altura literalmente fixa é um `h-80` de distância.
- **Limpeza diária do feed (o DELETE que não admite erro):** retenção decidida pelo dono =
  **só o dia corrente**. Job `'7 0 * * *'` America/Sao_Paulo (`executeTaskActivityCleanup`
  em `lib/services/cron-service.ts`) chama `taskManagement.purgeTaskActivity(cutoff)`.
  Corte = `startOfCivilDayInstant(now)` (nova função em `backend/domain/time/civil-day.ts` —
  00:00 SP = 03:00 UTC; MESMA função do filtro de leitura da rota
  `/api/tasks/activity`, que agora filtra `performedAt >=` início de hoje). Duas contas de
  "hoje" em lugares diferentes divergiriam na virada do dia — a função única é a trava.
- **SCOPO DURO do DELETE (medido em Prisma real):** a tabela `history` tem TRÊS famílias e
  só a de tarefa é apagável. **`GAMIFICATION_AWARD` (entityType "USER") NUNCA é apagada — a
  idempotência de premiação LÊ essas linhas (`history.findFirst` por descrição); apagar
  faria o sistema premiar duas vezes.** `LAB_NOTICE` é o quadro de avisos do laboratório
  em si, não log. O filtro `entityType: "task" + performedAt < cutoff` está nas DUAS
  instruções (OptionsMenu: `purgeOlderThan` deleteMany e `listRecent` where), e o
  roundtrip `tests/integration/task-activity-purge-roundtrip.test.ts` prova contra o banco
  5433 real: task antiga sai; task de hoje, prêmio antigo e aviso antigo sobrevivem.
- **Quirk colateral aceito:** `countBlockingDependencies` (delete de usuário, DEC-55) conta
  `history.performedBy` — limpar logs velhos reduz a contagem e um usuário bloqueado SÓ por
  logs antigos de tarefa torna-se deletável (409 → 200). Premiação e avisos continuam
  bloqueando sempre. O guarda `user-delete-schema-drift` não lê esse método, pelo desenho.
- **Gotcha do job:** `vi.hoisted` no mock da composition root (vi.mock é içado acima do
  `const purge`); `new Date()` dentro do método do cron compara bem com fake timers
  (`vi.setSystemTime("...T12:34Z")` → corte `...T03:00Z`) e NÃO flake. expressão nova
  `'7 0 * * *'` entra na lista pinada de `tests/unit/services/cron-schedule.test.ts`.

## V6-11m — liderança, resumo da Home, logos e o "concluiu" falso no feed (2026-10-19)

- **Feed não pode dizer "concluiu" antes da aprovação (dono, 2026-10-19):** `completeTask` de
  tarefa delegada/de projeto devolve `status: "in-review"` (o use case decide: só global/pública
  cai em `done`), mas o módulo gravava `action: "COMPLETE"` sempre — e o feed renderiza COMPLETE
  como "concluiu" + check verde. O log agora **obedece o status resultante**: `done` → COMPLETE,
  `in-review` → MOVE (feed: "moveu para Em Revisão", a mesma frase do remap do cartão). A
  aprovação continua sendo o único COMPLETE de tarefa de projeto. Congelado em
  `tests/unit/modules/task-management/task-activity-feed.test.ts` (dois casos: projeto→MOVE,
  global→COMPLETE).
- **Liderança (pedido do dono):** bloco do campeão maior (`p-8`, avatar `h-20`, pontos `text-4xl`)
  e a "Classificação completa" começa no **4º** — o top 3 já está no pódio; a tabela tinha um
  `podiumUsers.map` duplicado que saiu.
- **Resumo do laboratório (Home):** o aberto/fechado persiste em `dq:home-aberto`
  (`clientStorageKey` + `readJson`/`writeJson`); SSR sempre nasce aberto e o `useEffect` aplica a
  preferência (sem hydration mismatch). Fechada, o cabeçalho usa `py-3` (antes `pt-3` só) — sem o
  respiro de baixo o título ficava colado no topo ("torto pra baixo").
- **Logos do rodapé:** as três na MESMA altura (`h-8` = 32px; antes CNPq/Display `h-12`, IFNMG
  `h-24` → 285px de largura). As três são lockups horizontais (razões 3.25/2.97/2.55), então
  altura única alinha o porte e estreita o IFNMG (95px). A regra antiga de "proporção pela marca"
  (V6-11l) foi substituída por decisão do dono.
