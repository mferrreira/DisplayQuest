# 04 · SPEC — deep-gamification

> Contrato de **comportamento** da funcionalidade `04`: o "o que" e o "why", sem o
> "como". Esta e a **fonte de verdade** do que sera implementado — se o codigo divergir
> daqui, o codigo esta errado. Qualquer mudanca de requisito abre nova revisao.
>
> Secoes em PT-BR sem acentos (convencao do repo). IDs/enums em ingles.

## 1. Proposito

O DisplayQuest ja gamifica por cima de um unico campo — `users.points` — que hoje serve
**ao mesmo tempo** de moeda da loja (gasta em resgates) e de XP de progressao
(`PrismaGamificationGateway` deriva `xp` de `user.points`). Isso acopla projecao a
compras: gastar pontos derruba o nivel. Esta funcionalidade **separa XP de moeda** (XP
persistido em `users.xp`, nao-gastavel), consolida **nivel e tiers por threshold puro
com re-avaliacao rolling** (a cada award, nunca em batch semanal), integra progressao
(RF-53), awards (RF-54), badges com XP (RF-55), ranking por XP para o dashboard (RF-08)
e adiciona **lootboxes como RF novo** (RF-04-EXT-01..03) — sem quebrar a loja existente
(RF-56..58).

## 2. Contexto atual (linha de base)

Fatos verificados no codigo (linha de base da feature):

- **Conflacao points/xp** (`prisma/schema.prisma:14`): `users.points Int @default(0)` e
  o unico acumulador do usuario; `users.completedTasks` (`:15`) alimenta badges.
- **Derivacao a partir de points** (`backend/modules/gamification/infrastructure/
  prisma-gamification.gateway.ts`): `getUserProgression` faz `const xp = Math.max(0,
  user.points)` (`:135`), `getLevelByXp = floor(xp/100)` (`:271-273`, `LEVEL_XP_STEP=100`
  em `:19`), tiers `ELO_THRESHOLDS` DIAMANTE(2500)/OURO(1500)/PRATA(700)/BRONZE(0)
  (`:20-25`, `getEloByXp` `:275-279`).
- **Loja usa points** (`backend/modules/store`, `app/api/purchases/route.ts`, rotas
  `app/api/rewards` com `MANAGE_REWARDS`): resgate consome `points`; `purchases.status`
  dirigido por aprovacao (RF-58). D-04-04 exige que nada mude aqui.
- **Awards** (`prisma-gamification.gateway.ts`): `awardFromTaskCompletion`
  (`:80-123`, `pointsAwarded = floor(taskPoints) || 10`, `xpAwarded = pointsAwarded`),
  `awardFromWorkSession` (`:38-78`, formula duracao + tasks, `:263-269`); `applyAward`
  incrementa **so `points`** (`:200-243`) e grava `history` `action="GAMIFICATION_AWARD"`
  com dedup por `description "GAMIFICATION:<SRC>:<ID>"` (`:245-257`). Usos publicados
  por eventos (`backend/composition/root.ts:43` e `:67`).
- **Badges** (`garagem de regras` `backend/modules/gamification/domain/engines/
  badge-rules.engine.ts`): criterios usam `points`/`completedTasks`/stats; concedem
  `user_badges` (unique `@@unique([userId, badgeId])`, `prisma/schema.prisma:352`) sem
  XP associado. Tabelas `badges` (`:327-340`) e `user_badges` (`:342-353`).
- **Progressao consultavel** (`app/api/users/[id]/gamification/route.ts:17`):
  `ensureSelfOrPermission(auth.actor, userId, "MANAGE_USERS")`; retorna `{ progression }`.
- **RBAC/features** (`lib/auth/rbac.ts:18-19`: `MANAGE_REWARDS` e `MANAGE_PURCHASES` =
  [COORDENADOR, GERENTE, LABORATORISTA]; `lib/auth/features.ts`: `MANAGE_REWARDS`
  espelhado `:8`). `PERMISSIONS` nao tem keys de gamificacao/lootbox.
- **RFs da visao** (`docs/APOO/04-requisitos-funcionais.md`): RF-08 (rank/indicadores,
  linha 18), RF-53 (progressao, linha 81), RF-54 (conceder pontos, linha 82), RF-55
  (conceder badges, linha 83), RF-56 (listar recompensas, linha 84), RF-57 (resgatar,
  linha 85), RF-58 (aprovar/rejeitar/concluir/cancelar compras, linha 86).

Lacunas identificadas: (1) XP e moeda sao a mesma coluna; (2) tiers tipo ELO com reset
competitivo sem respaldo (D-04-02 os substitui por faixas fixas); (3) badges sem XP;
(4) sem ranking dedicado por progressao (o leaderboard raks por `points`,
`app/(dashboard)/dashboard/leaderboard/page.tsx:27-30`); (5) sem lootbox (D-04-03).

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| `VOLUNTARIO`, `COLABORADOR`, `PESQUISADOR`, `GERENTE_PROJETO`, `LABORATORISTA`, `GERENTE`, `COORDENADOR` | Qualquer autenticado | Consome/progressa (awards automáticos), consulta a propria progressao (RF-53), ve ranking por XP (RF-08), abre lootbox propria |
| `COORDENADOR`, `GERENTE` | Gestores (MANAGE_USERS) | Consultam progressao de qualquer usuario |
| `COORDENADOR`, `GERENTE`, `LABORATORISTA` | Detentores de `MANAGE_REWARDS` | Configuram a tabela de drops de lootbox (RF-04-EXT-01); continuam aprovando compras (RF-58, inalterado) |
| Sistema / engines | Ator tecnico | Award automático em task completion, work session e conquista de badge; re-avaliacao rolling de nivel/tier |

## 4. Requisitos funcionais

### RF-04.01 — XP separado da moeda de loja (persistencia)

- **Descricao:** `users.points` continua **moeda de loja** (gasta em resgates, como hoje).
  Novo campo `users.xp` e a **progression dedicada**: incrementado em awards e **nunca**
  decrementado, resgatado, trocado ou convertido em loot (D-04-01/D-04-08).
- **Fronteira:** `backend/modules/gamification` + `prisma/schema.prisma`.
- **Entradas/Saidas:** awards → `users.xp += xpAwarded` (persistente); leitura via
  `getUserProgression`.
- **Cenario principal (Gherkin):**
  ```
  Given um usuario U com points=100 e xp=0
  When  U recebe um award de task (taskPoints=50)
  Then  U fica com points=150 e xp=50; nenhuma operacao de loja altera o xp
  ```
- **Regras de negocio:** (1) `xp` nunca negativo (max 0 em leitura); (2) resgate de
  reward (RF-57) debita **apenas** `points`; (3) migracao com default `0` nao altera
  saldos existentes.

### RF-04.02 — Awards persistidos com level cache e re-avaliacao rolling

- **Descricao:** awards de **task completion** e **work session** persistem XP, e o nivel
  e o tier sao recalculados **no mesmo request** do award (rolling — D-04-02), gravando o
  cache `users.level`. Nao ha batch semanal nem "fechamento de ranking".
- **Fronteira:** `prisma-gamification.gateway.ts` (`applyAward`), engines puros.
- **Entradas/Saidas:** mesmos comandos atuais (`AwardFromTaskCompletionCommand`,
  `AwardFromWorkSessionCommand`); dedup por `GAMIFICATION_AWARD` preservado.
- **Cenario principal (Gherkin):**
  ```
  Given U com xp=95 e level=0
  When  U recebe award de work session que rende 10 xp
  Then  U fica com xp=105, level=1 (cache persistido) e tier Aprendiz no mesmo request
  ```
- **Regras de negocio:** (1) re-avaliacao executa em tx unica com o incremento; (2) replay
  de award marcado `alreadyAwarded` nao realoca nivel/xp; (3) formula de pontos de work
  session inalterada (`:263-269`) — apenas passa a persistir xp.

### RF-04.03 — Nivel por threshold puro

- **Descricao:** nivel = `floor(max(0, xp) / 100)` (`LEVEL_XP_STEP = 100` mantido), em
  funcao pura sem I/O em `level.engine.ts`.
- **Fronteira:** `backend/modules/gamification/domain/engines/level.engine.ts`.
- **Cenario principal (Gherkin):**
  ```
  Given xp=0 When getLevelByXp Then 0; Given xp=99 Then 0; Given xp=100 Then 1
  ```
- **Regras de negocio:** bordas puras; nenhum estado de nivel fora do cache.

### RF-04.04 — Tiers por faixa fixa de XP, re-avaliacao rolling

- **Descricao:** substitui `ELO_THRESHOLDS` (DIAMANTE/OURO/PRATA/BRONZE) por **tiers com
  nomes e thresholds fixos** (D-04-02), derivados sempre do XP (nunca persistidos em
  coluna propria): `NOVICE`(Iniciante, 0) → `APPRENTICE`(Aprendiz, 100) → `ADEPT`
  (Praticante, 300) → `EXPERT`(Especialista, 600) → `MASTER`(Mestre, 1000) →
  `LEGENDARY`(Lendario, 1500).
- **Fronteira:** `backend/modules/gamification/domain/engines/tier.engine.ts` (funcao pura).
- **Cenario principal (Gherkin):**
  ```
  Given xp=250 When getTierByXp Then { id: APPRENTICE, nextTier: ADEPT, nextTierMinXp: 300 }
  ```
- **Regras de negocio:** tabela fixa em constante TS (config de dev nessa tabela);
  reavaliacao a cada award; sem reset/fechamento competitivo.

### RF-04.05 — Badges concedem XP uma unica vez (RF-55)

- **Descricao:** badge conquistado por regra (`badge-rules.engine.ts`) concede
  `BADGE_XP = 50` de XP **apenas na primeira conquista** (dedup por
  `@@unique([userId, badgeId])`), persistindo level/tier na sequencia.
- **Fronteira:** `evaluateUserBadges` (gateway) + engine de nivel/tier.
- **Cenario principal (Gherkin):**
  ```
  Given U sem o badge B
  When  U atende os criterios de B e o badge e concedido
  Then  U ganha +50 xp e o badge; uma segunda avaliacao nao concede xp de novo
  ```
- **Regras de negocio:** badge manual (awardBadge direto, RF-55) tambem concede
  `BADGE_XP`; badges ja conquistados antes da migracao nao dao XP retroativo (sem backfill).

### RF-04.06 — Consultar progressao gamificada integrada (RF-53)

- **Descricao:** `get-user-progression` integra xp persistido, level (cache), tier/nextTier,
  badges recentes, `points` (moeda de loja) e tier boost opcional.
- **Fronteira:** `backend/modules/gamification` + `app/api/users/[id]/gamification/route.ts`.
- **Cenario principal (Gherkin):**
  ```
  Given U autenticado (self) ou ator com MANAGE_USERS
  When  GET /api/users/[id]/gamification
  Then  200 com progression contendo xp, level, tier, tierLabel, tierColor,
        nextTier, nextTierMinXp, progressToNextLevel, points, badges[]
  ```
- **Regras de negocio:** leitura para self ou `MANAGE_USERS` (permssao atual mantida);
  `level` retornado e o cache validado contra `getLevelByXp(xp)` (converge se drift).

### RF-04.07 — Ranking/indicadores por XP no dashboard (RF-08)

- **Descricao:** leaderboard passa a **ranquear por `users.xp desc`** (progression), com
  nivel/tier como indicadores e `points` como metrica secundaria da loja (nao-ordena).
- **Fronteira:** `app/api/gamification/leaderboard/route.ts` + leaderboard page.
- **Cenario principal (Gherkin):**
  ```
  Given qualquer autenticado A
  When  GET /api/gamification/leaderboard?limit=50
  Then  200 com ranking por xp desc (limite 1..100) e posicao do A
  ```
- **Regras de negocio:** leitura liberada a qualquer autenticado; `points` exibido mas
  nunca usado para ordenar (D-04-01; nao-regressao da loja).

### RF-04.08 — Recompensas e resgates sem regressao (RF-56/57/58 herdados)

- **Descricao:** `rewards`, `purchases`, badges e aprovacao de compras continuam
  exatamente como hoje: listar recompensas (RF-56), resgatar com `points` (RF-57),
  aprovar/rejeitar/concluir/cancelar (RF-58). Gamificacao so **consome** a loja (abrir
  lootbox debita `points`) e nao altera schema nem rotas dela (D-04-04).
- **Fronteira:** `backend/modules/store`, `app/api/rewards`, `app/api/purchases`.
- **Cenario principal (Gherkin):**
  ```
  Given a feature 04 de gamificacao ativa
  When  os fluxos atuais de rewards/purchases sao executados
  Then  comportamento, permissoes e schema permanecem inalterados (nao-regressao)
  ```

### RF-04-EXT-01 — Configurar tabela de drops de lootbox

- **Descricao:** novo RF (D-04-03): tabela configuravel de drops com `dropType`
  (`BADGE`, `REWARD_DRAFT`, `TIER_BOOST`), `referenceId`, `probability` (0..1), `isActive`.
- **Fronteira:** `backend/modules/gamification` (novo use-case `configure-lootbox-drops`)
  + `app/api/gamification/lootbox/config`.
- **Cenario principal (Gherkin):**
  ```
  Given um ator com MANAGE_REWARDS
  When  POST /api/gamification/lootbox/config { drops: [...] }
  Then  a tabela ativa e substituida (upsert), validada e persistida
  ```
- **Regras de negocio:** (1) soma das probabilidades <= 1 (resto = `SEM_REWARD`);
   (2) `referenceId` obrigatorio e existente conforme o tipo (BADGE→badge `isActive`,
   REWARD_DRAFT→reward `available`, TIER_BOOST→null); (3) `isActive=false` desativa sem
   deletar; (4) qualquer outro ator → 403.

### RF-04-EXT-02 — Abrir lootbox (store points ou marco de XP)

- **Descricao:** abertura por **store points** (custo configurado, default 100) ou por
  **marco de XP** (consome 1 `freeLootboxKeys`, ganho a cada level-up na re-avaliacao
  rolling). Resultado: roll ponderado + aplicacao do drop.
- **Fronteira:** `lootbox.engine.ts` (roll puro) + `open-lootbox.use-case.ts` +
  `app/api/gamification/lootbox/open`.
- **Cenario principal (Gherkin):**
  ```
  Given U com points>=custo
  When  POST /api/gamification/lootbox/open { source: "STORE_POINTS" }
  Then  points diminui do custo, xp inalterado, resultado gravado em lootbox_openings
  Given U com >=1 freeLootboxKeys
  When  POST /api/gamification/lootbox/open { source: "XP_MILESTONE" }
  Then  1 key consumida, xp/points inalterados, resultado gravado
  ```
- **Regras de negocio:** (1) `points` nunca negativo (error "Pontos insuficientes");
   (2) sem key → error; (3) BADGE duplicado rerolla ate 3x (pool restante) e cai em
   consolacao de store points; (4) `TIER_BOOST` grava validade +7d; (5) `REWARD_DRAFT`
   grava voucher sem tocar a loja.

### RF-04-EXT-03 — Invariantes de lootbox (XP nunca vira loot; loja intacta)

- **Descricao:** nenhum drop altera `users.xp` (D-04-08); nenhum drop cria/edita
  `rewards`/`purchases` (D-04-04).
- **Fronteira:** `lootbox.engine.ts` + `open-lootbox.use-case.ts`.
- **Cenario principal (Gherkin):**
  ```
  Given U com xp=500
  When  U abre qualquer sequencia de lootboxes (seja a fonte)
  Then  xp permanece 500 e nenhuma linha de rewards/purchases e alterada
  ```
- **Regras de negocio:** invariante testada por suite dedicada.

## 5. Requisitos nao funcionais

| Categoria | RNF | Criterio de verificacao |
|---|---|---|
| Seguranca | Enforcement de config de lootbox 100% backend (`MANAGE_REWARDS`); abertura so para o proprio usuario | `lootbox-drop-config.test.ts` + `open-lootbox.test.ts` |
| Integridade | XP monotinico nao-gastavel; awards dedupados (`GAMIFICATION_AWARD`) | AC-04-01/03/08; invarriante de lootbox |
| Compatibilidade | Loja (RF-56..58) sem regressao; schema de rewards/purchases intocado | AC-04-14 + G3 sem regressao (256/257 + novos) |
| Performance | Rolling em tx unica; leaderboard ordenado por indice/coluna `xp` (limite 1..100) | Sem varredura full-table; limite/indice no PLAN |
| Observabilidade | Cada AC com evidencia; STATE.json registra gates/rollbacks | ARCHITECTURE gating |
| Auditabilidade | Aplicacao de BADGE drop registrada em `history` (`GAMIFICATION_AWARD`); restante em `lootbox_openings` (nao em `audit_logs` nesta versao — D-04-04, ver SPEC §7.2) | teste de opening + AC-04-12 |

## 6. Modelo de dados (se aplicavel)

Mudancas em `prisma/schema.prisma` (nomes snake_case, padrao do repo):

```prisma
model users {
  id               Int      @id @default(autoincrement())
  points           Int      @default(0)   // MOEDA DE LOJA (inalterado: spendable)
  xp               Int      @default(0)   // NOVO: progression nao-gastavel (D-04-01)
  level            Int      @default(0)   // NOVO: cache de nivel (rolling no award)
  freeLootboxKeys  Int      @default(0)   // NOVO: 1 key por level-up (marco de XP, D-04-03)
  // demais campos e relacoes inalterados
}

enum LootboxDropType {
  BADGE        // award via badge engine (dedup + reroll)
  REWARD_DRAFT // voucher gravado; resgate fora de escopo v1
  TIER_BOOST   // tier cosmetico por 7 dias (nao mexe em xp)
}

enum LootboxOpenSource {
  STORE_POINTS // custo em users.points (default 100)
  XP_MILESTONE // consome 1 users.freeLootboxKeys
}

model lootbox_drop_configs {
  id          Int             @id @default(autoincrement())
  name        String
  dropType    LootboxDropType
  referenceId Int?            // badges.id | rewards.id | null (TIER_BOOST)
  probability Float           // 0..1; soma <= 1; resto = SEM_REWARD
  isActive    Boolean         @default(true)
  createdBy   Int
  createdAt   DateTime        @default(now())
}

model lootbox_openings {
  id                 Int              @id @default(autoincrement())
  userId             Int
  openSource         LootboxOpenSource
  costPoints         Int              @default(0)
  drops              Json             // resultado aplicado [{ type, referenceId, value? }]
  tierBoostExpiresAt DateTime?        // preenchido em TIER_BOOST
  openedAt           DateTime         @default(now())
  user               users            @relation("UserLootboxOpenings", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, openedAt])
}
```

- `users.xp`/`level`/`freeLootboxKeys` com default: migracao **nao toca saldos**.
- `elo` nao vira coluna (era string derivada); o contrato `UserProgression` ganha
  `tier/tierLabel/tierColor/nextTier/nextTierLabel/nextTierMinXp` e **remonta a key
  `elo`** (consumidores: rotas/UI internas desta feature).
- Migracoes versionadas: `add_users_xp_level` (Etapa 2) e
  `add_lootbox_drop_configs_and_openings` (Etapa 5). **Sem `db push`** (gotcha do repo).
- Relacao nova em `users`: `lootboxOpenings lootbox_openings[] @relation("UserLootboxOpenings")`.
- A tabela `history` (usada pelo gateway para dedup de award) permanece; o `audit_logs`
  da feature 02 nao recebe esses eventos nesta versao (D-04-04 registrado no STATE).

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados
| Metodo | Rota | Descricao | Permissao |
|---|---|---|---|
| GET | `/api/users/[id]/gamification` | **Alterado**: payload novo `UserProgression` (xp/level/tier/nextTier/badges/points) | self ou `MANAGE_USERS` (inalterado) |
| GET | `/api/gamification/leaderboard?limit=N` | **Novo**: ranking por `xp desc` (nivel/tier/points exibidos) | qualquer autenticado |
| POST | `/api/gamification/lootbox/open` | **Novo**: abrir lootbox `{ source: STORE_POINTS \| XP_MILESTONE }` | self |
| GET | `/api/gamification/lootbox/config` | **Novo**: listar tabela ativa de drops | `MANAGE_REWARDS` |
| POST | `/api/gamification/lootbox/config` | **Novo**: substituir (upsert) tabela ativa de drops | `MANAGE_REWARDS` |
| POST/PATCH | `/api/rewards`, `/api/purchases` (+`[id]`) | Inalterados (baseline RF-56/57/58; nao-regressao) | regras atuais (`MANAGE_REWARDS`/`MANAGE_PURCHASES`) |

### 7.2 Eventos de dominio publicados/consumidos
| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `onTaskCompleted` (award task) | task-management (`gamification-task-progress.events`, composition root:43) | gamification (`awardFromTaskCompletion`) | Existente; passa a persistir xp |
| `WORK_SESSION_COMPLETED` (award sessao) | work-execution (`work-execution-events.publisher`, composition root:67) | gamification (`awardFromWorkSession`) | Existente; passa a persistir xp |
| `GAMIFICATION_AWARD` (`history`) | gamification gateway | storage interno (dedup) | Existente; mantido |
| Abertura de lootbox | gamification (use-case) | `lootbox_openings` | Novo — sem fila, sync |

Nenhum evento novo cruza modulo; abertura de lootbox e registro local (sem publicacao
externa). Auditoria funcional desta feature **nao** usa `audit_logs` nesta versao.

## 8. Casos de teste / evidencia esperada

Novos testes (unit sob `tests/unit/**`, integration sob `tests/integration/**`):

```
- tests/unit/modules/gamification/level-engine.test.ts                   (AC-04-04)
- tests/unit/modules/gamification/tier-engine.test.ts                    (AC-04-05)
- tests/unit/modules/gamification/prisma-gamification.award-xp.test.ts   (AC-04-01..05)
- tests/integration/gamification-xp-roundtrip.test.ts                    (AC-04-02/03; DB real localhost:5432)
- tests/unit/modules/gamification/progression-contract.test.ts           (AC-04-06/07)
- tests/unit/modules/gamification/badge-xp.test.ts                       (AC-04-08)
- tests/unit/modules/gamification/leaderboard-route.test.ts              (AC-04-09)
- tests/unit/modules/gamification/lootbox.engine.test.ts                 (AC-04-10/11)
- tests/unit/modules/gamification/open-lootbox.test.ts                   (AC-04-12)
- tests/unit/modules/gamification/lootbox-drop-config.test.ts            (AC-04-10)
- tests/unit/modules/gamification/lootbox-invariants.test.ts             (AC-04-13)
- tests/unit/lib/auth/gamification-features-parity.test.ts               (AC-04-15)
- tests/unit/components/gamification/progression-card.test.tsx           (AC-04-15)
```

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **256/257 de base** (unico fail conhecido `floating-session-timer`)
  + todos os novos verdes
- G4 `docker compose up -d postgres && npx vitest run` — green (schema/DB tocados)
- G5 `npx prisma migrate dev` (local) — sem `db push`

Contagem esperada ao final: baseline 256/257 + ~13 novos testes unit + 1 integration.

## 9. Acceptance criteria (definitivos e rastreaveis)

| ID | Done criterion (Given/When/Then) | Evidencia para verificar | Rastreia |
|---|---|---|---|
| AC-04-01 | Given user com points e xp distintos; When awards e resgates ocorrem; Then `xp` so sobe (nunca e debitado por loja) e `points` e a unica moeda resgatavel | `prisma-gamification.award-xp.test.ts` + suites de purchases | RF-04.01 / RF-54 / RF-57 |
| AC-04-02 | Given migracao `add_users_xp_level` aplicada; Then `users` ganham xp=0/level=0/freeLootboxKeys=0 com saldos de points intactos | `npx prisma migrate status` + `gamification-xp-roundtrip.test.ts` | RF-04.01 / RF-04.02 |
| AC-04-03 | Given award de task ou work session; Then xp e incrementado, level persistido e tier recalculado na mesma transacao; replay nao realoca | `prisma-gamification.award-xp.test.ts` + roundtrip integration | RF-04.02 / RF-54 |
| AC-04-04 | Given xp em bordas de 100; When getLevelByXp; Then 0/0/1 conforme limiar puro (xp=0→0, 99→0, 100→1) | `level-engine.test.ts` | RF-04.03 |
| AC-04-05 | Given xp em cada faixa da TIER_TABLE; When getTierByXp; Then tier/tierLabel/nextTier/nextTierMinXp corretos, sem estado persistido | `tier-engine.test.ts` | RF-04.04 |
| AC-04-06 | Given badge conquistado por regra; Then +50 xp na primeira conquista e zero em re-avaliacao (dedup unique) | `badge-xp.test.ts` | RF-04.05 / RF-55 |
| AC-04-07 | Given self ou MANAGE_USERS; When GET /api/users/[id]/gamification; Then 200 com xp/level/tier/badges/points; demais → 403 | `progression-contract.test.ts` | RF-04.06 / RF-53 |
| AC-04-08 | Given GET /api/gamification/leaderboard?limit=N; Then ranking por xp desc (1..100) com nivel/tier e points secundario; 400 em limit invalido | `leaderboard-route.test.ts` | RF-04.07 / RF-08 |
| AC-04-09 | Given qualquer autenticado; When consulta leaderboard/progressao; Then leitura liberada; sem regra de negocio nas rotas | `leaderboard-route.test.ts` | RF-04.07 / RF-08 |
| AC-04-10 | Given ator com MANAGE_REWARDS; When POST /api/gamification/lootbox/config; Then tabela validada (0..1, soma<=1, referenceId por tipo) e substituida; 403 sem a permissao | `lootbox-drop-config.test.ts` | RF-04-EXT-01 |
| AC-04-11 | Given roll ponderado com BADGE duplicado; When drop processado; Then reroll ate 3x e consolacao em store points (nunca xp) | `lootbox.engine.test.ts` | RF-04-EXT-02 |
| AC-04-12 | Given abertura por STORE_POINTS ou XP_MILESTONE; Then custo debita points (nunca negativo) ou consome 1 key; resultado gravado; xp inalterado | `open-lootbox.test.ts` | RF-04-EXT-02 |
| AC-04-13 | Given aberta qualquer sequencia de lootboxes; Then nenhum drop altera users.xp nem cria/edita rewards/purchases | `lootbox-invariants.test.ts` | RF-04-EXT-03 |
| AC-04-14 | Given fluxos de loja existentes (RF-56/57/58) e badges (RF-55); When a feature entra; Then comportamento/permissoes/schema de rewards+purchases inalterados, unit = 256/257 + novos verdes | Gates G1–G3 + suites existentes | RF-04.08 / D-04-04 |
| AC-04-15 | Given FEATURE_ACCESS; Then VIEW_PROGRESSION (todos) e MANAGE_LOOTBOX (=MANAGE_REWARDS) presentes e espelhando RBAC; UI renderiza progressao/progress bar so com o mirror | `gamification-features-parity.test.ts` + `progression-card.test.tsx` | RF-04.06 / RF-08 |
| AC-04-16 | Given todas as etapas verdes; Then G1–G5 verdes, migracoes versionadas sem db push, STATE.json com evidencias | checklist do PLAN §6 | processo geral |

## 10. Fora de escopo (desta versao)

- Reset de ELO competitivo/fechado (DIAMANTE..BRONZE sao **substituidos** por tiers fixos;
  sem torneio semanal).
- Resgate de voucher `REWARD_DRAFT` (a gravacao do voucher existe; converter em compra e
  fluxo futuro sobre RF-57).
- Auditar aberturas de lootbox em `audit_logs` (fica em `lootbox_openings` nesta versao).
- TTL/purga de `lootbox_openings` e expiracao/manutencao de `TIER_BOOST` alem do campo
  `tierBoostExpiresAt`.
- Gamificacao por ato de aprovar/rejeitar (aprovador) — fora da fronteira (01 nao cobre).
- Multiclassificacao de usuarios (leaderboard unico global por xp).
- 05-multi-lab e 06-auth/sso (plan-v2).
- Alterar `PERMISSIONS`/`FEATURE_ACCESS` existentes (apenas ADICIONA
  `VIEW_PROGRESSION`/`MANAGE_LOOTBOX`).

## 11. Dependencias e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| `01-roles-permissions` (RBAC/flags base) | dep do plan-v2 | obrigatorio `done` |
| `02-logging-audit` (audit_logs) | dep do plan-v2 | obrigatorio `done` |
| `03-project-lifecycle-reports` | dep do plan-v2 | obrigatorio `done` |
| Postgres local ligado para G4/G5 | runtime | `docker compose up -d postgres` |
| Decisao do dono: `users.freeLootboxKeys` como contador de chaves por level-up | decisao de negocio | Confirmar (ver STATE `blockers[]`) |
| Decisao do dono: leaderboard ordenado por xp (points deixa de ordenar) | decisao de negocio | Confirmar sob RF-08 (ver STATE `blockers[]`) |
| Decisao do dono: resgate de REWARD_DRAFT adiado | decisao de negocio | Confirmar (ver STATE `blockers[]`) |
| `floating-session-timer` (fail conhecido) | teste legado | Nao bloqueador (baseline 256/257) |