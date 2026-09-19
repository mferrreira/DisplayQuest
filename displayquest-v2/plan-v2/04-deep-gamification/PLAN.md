# 04 · PLAN — deep-gamification

> Contrato de **execucao** da funcionalidade `04`. Deriva da SPEC aprovada
> (`04/SPEC.md`). Define a ordem de implementacao em etapas (batches), cada uma com
> arquivos tocados, done criteria observaveis e gates de verificacao. **A SPEC e a
> fonte de verdade do comportamento; este PLAN e a fonte de verdade da execucao.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `04/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convencoes e gotchas).

## 1. Escopo

Cobre a **divisao XP × moeda de loja** (RF-54), **nivel/tiers por threshold puro com
re-avaliacao rolling** (D-04-02), **progressao consultavel integrada** (RF-53), **badges
concedendo XP** (RF-55), **ranking/indicadores por XP** (RF-08) e **lootboxes como RF
novo** (RF-04-EXT-01..03, D-04-03). E garante **nao-regressao da loja** (RF-56..58,
D-04-04): `rewards`, `purchases`, badges e aprovacao de compras permanecem intactos.

Assume como baseline ja implementado (nao reescreve): modulo `gamification`
(`backend/modules/gamification/`, engines `award-from-task-completion`,
`award-from-work-session`, `get-user-progression`, `badge.engine.ts`,
`badge-rules.engine.ts`), modulo `store` (`purchase-query-scope.ts`,
`PrismaStoreGateway`), rotas `app/api/rewards` + `app/api/purchases` (aprovacao de
compras), RBAC (`lib/auth/rbac.ts`) e feature flags (`lib/auth/features.ts`).

Fora de escopo (ver SPEC §10): reset de ELO tipo ranking competitivo fechado (DIAMANTE/
OURO/PRATA/BRONZE e substituido por tiers fixos, sem fechamento semanal), resgate de
vocher `REWARD_DRAFT`, TTL/purga de `lootbox_openings`, gamificacao de atos de aprovacao
e 05/06 do plan-v2.

## 2. Dependencias

- Do PLAN-v2: `01-roles-permissions` (`done` obrigatorio — permissoes/feature flags que
  a UI espelha), `02-logging-audit` (`done` obrigatorio — `audit_logs` e a trilha; a
  gamificacao **nao** migra o `history.create` interno do gateway nesta feature),
  `03-project-lifecycle-reports` (`done` obrigatorio). `dependencies.list = ["01","02","03"]`.
- De runtime/infra: Postgres local para G4/G5 (`docker compose up -d postgres`,
  container `display-quest-db`); migracoes versionadas via `npx prisma migrate dev`.
- De schema: **novo** `users.xp`, `users.level`, `users.freeLootboxKeys`,
  `lootbox_drop_configs`, `lootbox_openings` (SPEC §6). `users.points` permanece moeda
  de loja e **nao** e tocado semanticamente.
- De dominio existente: composicao ja injeta awards em
  `backend/composition/root.ts:43` (`gamification-task-progress.events`) e `:67`
  (`work-execution-events.publisher`) — os publishes sao preservados, apenas o gateway
  passa a persistir XP.

## 3. Etapas de implementacao (ordem obrigatoria)

Cada etapa e um **lote atomico** com evidencia observavel. Nunca avance sobre lote
vermelho.

### Etapa 1 — Manifestar o gap atual de XP conflacionado (leitura/rastreio)

**Objetivo** — Congelar, como evidencia, o estado atual em que `users.points` acumula
**moeda de loja E XP de uma vez so** (`PrismaGamificationGateway` deriva `xp` de
`user.points` e `ELO_THRESHOLDS` de DIAMANTE/OURO/PRATA/BRONZE). Nenhum codigo de
producao e alterado.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/04-deep-gamification/SPEC.md            (secao 2 "Contexto atual": inventario do gap com file:line)
- plan-v2/04-deep-gamification/STATE.json         (evidencia "gap-conflation" registrada)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC1.1 — `SPEC.md` §2 cita com file:line reais: `users.points Int @default(0)`
      (`prisma/schema.prisma:14`), `getUserProgression` deriva `const xp = Math.max(0,
      user.points)` (`backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts:135`),
      `applyAward` incrementa **apenas** `points` (`:208-215`) e grava `history` com
      `action="GAMIFICATION_AWARD"` (`:217-239`), dedup por `description`
      `GAMIFICATION:${sourceType}:${sourceId}` (`:245-257`).
- [ ] DC1.2 — `SPEC.md` §2 registra os tiers atuais `ELO_THRESHOLDS`
      DIAMANTE(2500)/OURO(1500)/PRATA(700)/BRONZE(0) (`:20-25`) e `LEVEL_XP_STEP = 100`
      (`:19`) — evidencia de que nivel/tier hoje sao derivados do mesmo `points` usado
      como moeda na loja (`app/api/purchases`, `backend/modules/store`).
- [ ] DC1.3 — Nenhum arquivo de producao alterado (`git status` mostra apenas
      `plan-v2/04-deep-gamification/`).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json plan-v2/04-deep-gamification/SPEC.md` · `npx tsc --noEmit` (baseline 0 errors) · `npx vitest run` (baseline 256/257; unico fail conhecido `floating-session-timer`).

### Etapa 2 — Schema de XP + nivel + persistencia de awards com re-avaliacao rolling

**Objetivo** — Criar `users.xp` (progression, nao-gastavel), `users.level` (cache) e
`users.freeLootboxKeys`; migrar; fazer os awards de **task completion e work session**
persistirem XP + `level` e `elo`/tier recalculados no **mesmo** request (rolling — D-04-02).
`users.points` continua acumulando moeda de loja (D-04-01), sem mudanca de semantica.

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                                                     (model users: + xp Int @default(0); + level Int @default(0); + freeLootboxKeys Int @default(0))
- prisma/migrations/<timestamp>_add_users_xp_level/                        (via `npx prisma migrate dev --name add_users_xp_level`)
- backend/modules/gamification/application/contracts.ts                    (UserProgression: + tier/tierLabel/tierColor/nextTier/nextTierLabel/nextTierMinXp; elo trocado por tier)
- backend/modules/gamification/application/ports/gamification.gateway.ts   (assinatura getUserProgression/applyAward retornam novo UserProgression)
- backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts (getUserProgression le users.xp; applyAward incrementa xp E points e grava level cache numa tx; hasAward inalterado)
- backend/modules/gamification/domain/engines/level.engine.ts              (NOVO: funcao pura getLevelByXp, mantem LEVEL_XP_STEP=100)
- backend/modules/gamification/domain/engines/tier.engine.ts               (NOVO: funcao pura getTierByXp com TIER_TABLE fixa)
- tests/unit/modules/gamification/prisma-gamification.award-xp.test.ts     (NOVO: mocks de repositorio/prisma, AC-04-01..AC-04-05)
- tests/integration/gamification-xp-roundtrip.test.ts                      (NOVO: environment node, DB real, AC-04-02/03)
```

**Mudancas de schema (se houver):** `users` ganha `xp Int @default(0)`,
`level Int @default(0)`, `freeLootboxKeys Int @default(0)` (todos com default — migracao
nao toca linhas existentes; `points` intocado). Migracao versionada G5; **proibido** `db push`.

**Contrato a implementar (decisao registrada no STATE `decisions[]` D-04-01/D-04-02):**

```
getLevelByXp(xp) = Math.floor(Math.max(0, xp) / 100)            // nivel puro por limiar
getTierByXp(xp)  -> { id, label, color, nextTier, nextTierMinXp }   // tabela fixa, ver SPEC §6
applyAward(...):  [ points += pointsAwarded, xp += xpAwarded, level = getLevelByXp(xp) ] em 1 tx
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC2.1 — `npx prisma migrate dev --name add_users_xp_level` gera versao local;
      `npx prisma migrate status` limpo; schema mostra `xp`/`level`/`freeLootboxKeys`.
- [ ] DC2.2 — `getUserProgression` agora le `users.xp` (nao `points`) para `xp`/`level`;
      `points` retornado intacto como moeda de loja (AC-04-01).
- [ ] DC2.3 — `awardFromTaskCompletion` e `awardFromWorkSession` incrementam `xp` e
      `points` na mesma transacao e persistem `level` recalculado; dedup `alreadyAwarded`
      preserva zero award em replay (AC-04-03/04).
- [ ] DC2.4 — Novo `UserProgression` expoe `tier`/`tierLabel`/`tierColor`/
      `nextTier`/`nextTierLabel`/`nextTierMinXp`; `elo` removido do contrato (consumidores
      atualizados: rota de progressao em Etapa 4) (AC-04-04).
- [ ] DC2.5 — Roundtrip integration verde: award + releitura com `xp`/`level` esperados e
      `points` preservados (AC-04-02/03).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados da etapa>` · `npx tsc --noEmit` · `set -a; source .env; set +a; npx vitest run tests/unit/modules/gamification/prisma-gamification.award-xp.test.ts tests/integration/gamification-xp-roundtrip.test.ts` · `docker compose up -d postgres && npx vitest run` (G4) · `npx prisma migrate dev --name add_users_xp_level` (G5).

### Etapa 3 — Engines puros de nivel/tier com rolling + testes da tabela

**Objetivo** — Endurecer as funcoes puras (`level.engine.ts`, `tier.engine.ts`) como
**unica fonte de verdade** de nivel/tier: thresholds fixos, re-avaliacao **a cada award**
(rolling) e sem estado persistido de tier (derivado sempre do `xp`). Testes de matriz
pura sem I/O.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/gamification/domain/engines/level.engine.ts   (refinar: exporta getLevelByXp, LEVEL_XP_STEP)
- backend/modules/gamification/domain/engines/tier.engine.ts    (refinar: TIER_TABLE + getTierByXp + proximidade/next)
- tests/unit/modules/gamification/level-engine.test.ts          (NOVO: matriz de limiares, AC-04-04)
- tests/unit/modules/gamification/tier-engine.test.ts           (NOVO: faixas, nextTier, bordas negativas/zero, AC-04-05)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — `level.engine.ts` e `tier.engine.ts` sao funcoes puras (sem import de
      prisma/repositorio; tipadas com `TierId` de `contracts`/engine).
- [ ] DC3.2 — Tabela de tier fixa documentada: bordas de cada faixa e `nextTier`
      (AC-04-05).
- [ ] DC3.3 — Testes verdes em isolamento:
      `npx vitest run tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts`.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/modules/gamification/domain/engines/level.engine.ts backend/modules/gamification/domain/engines/tier.engine.ts tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts` · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts`.

### Etapa 4 — Endpoint de progressao integrado (XP + tier + badges + ranking RF-08)

**Objetivo** — `get-user-progression` passa a integrar XP/tier/level/badges recentes e a
rota `app/api/users/[id]/gamification/route.ts` devolve o novo contrato. Novo endpoint de
**ranking por XP** para o dashboard (RF-08). Badges conquistados por regras concedem XP
unico (D-04-07).

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/gamification/application/use-cases/get-user-progression.use-case.ts  (integra badges recentes + tier boost se houver)
- backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts           (getUserProgression: xp real + badges via listRecentUserBadges; evaluateUserBadges concede BADGE_XP dedup)
- app/api/users/[id]/gamification/route.ts                                             (payload novo UserProgression; eslint/tsc ok)
- app/api/gamification/leaderboard/route.ts                                            (NOVO: GET ?limit, ranking xp desc)
- tests/unit/modules/gamification/progression-contract.test.ts                         (NOVO: contrato da rota, AC-04-06/07)
- tests/unit/modules/gamification/badge-xp.test.ts                                     (NOVO: dedup do XP de badge, AC-04-08)
- tests/unit/modules/gamification/leaderboard-route.test.ts                            (NOVO: permissao/ordenacao, AC-04-09)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC4.1 — `GET /api/users/[id]/gamification` devolve `{ progression }` com
      `xp`, `level`, `tier/tierLabel/tierColor/nextTier`, `badges[]` (recentes) e
      `points` (moeda) — self ou `MANAGE_USERS` (permssao inalterada) (AC-04-06/07).
- [ ] DC4.2 — Badge conquistado por `evaluateUserBadges` concede XP **uma unica vez**
      (`@@unique([userId, badgeId])`; `BADGE_XP = 50` constante) e persiste `level`
      (AC-04-08).
- [ ] DC4.3 — `GET /api/gamification/leaderboard?limit=N` (default 20, max 100) ordena por
      `users.xp desc` com nivel/tier e `points` como metrica secundaria exibida; qualquer
      autenticado le (RF-08), 400 para `limit` invalido (AC-04-09).
- [ ] DC4.4 — Nenhuma regra de negocio nas rotas (thin adapters); erro tipado 403/400
      traduzido do dominio.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 5 — Lootboxes (RF-04-EXT-01..03): tabela de drops configurável + abertura

**Objetivo** — Novo RF "caixa misteriosa" de ponta a ponta: tabela de drops com
probabilidades configuravel (admin), abertura por **store points** (custo configurado,
default 100) ou por **marco de XP** (consome `freeLootboxKeys`, ganha a cada level-up), e
aplicacao do drop (BADGE via engine com dedup/reroll, REWARD_DRAFT como voucher gravado
sem mutacao da loja, TIER_BOOST cosmetico por 7 dias). **XP nunca vira loot** (D-04-08).

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                                                              (model lootbox_drop_configs + lootbox_openings + enums LootboxDropType/LootboxOpenSource)
- prisma/migrations/<timestamp>_add_lootbox_drop_configs_and_openings/              (G5: `npx prisma migrate dev --name add_lootbox_drop_configs_and_openings`)
- backend/modules/gamification/application/contracts.ts                             (+ OpenLootboxCommand, LootboxDropConfig, LootboxOpeningResult, LootboxDropType)
- backend/modules/gamification/application/ports/gamification.gateway.ts            (+ listLootboxDrops, saveLootboxDrops, openLootbox)
- backend/modules/gamification/domain/engines/lootbox.engine.ts                     (NOVO: roll puro ponderado + reroll BADGE + consolacao; sem I/O)
- backend/modules/gamification/application/use-cases/open-lootbox.use-case.ts       (NOVO)
- backend/modules/gamification/application/use-cases/configure-lootbox-drops.use-case.ts (NOVO)
- backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts        (+ persistencia de configs/openings; chama engine; registrar `history` GAMIFICATION_AWARD p/ BADGE drop)
- app/api/gamification/lootbox/open/route.ts                                        (NOVO: POST, self)
- app/api/gamification/lootbox/config/route.ts                                      (NOVO: GET listar / POST substituir tabela ativa)
- tests/unit/modules/gamification/lootbox.engine.test.ts                            (NOVO: roll, pesos, reamostragem, AC-04-10)
- tests/unit/modules/gamification/open-lootbox.test.ts                              (NOVO: custo, saldo, key por marco, AC-04-11/12)
- tests/unit/modules/gamification/lootbox-drop-config.test.ts                       (NOVO: validacao de config/referenceId, AC-04-10)
- tests/unit/modules/gamification/lootbox-invariants.test.ts                        (NOVO: XP nunca alterado por drops, AC-04-12/13)
```

**Mudancas de schema (se houver):** `lootbox_drop_configs` (id, name, dropType
`LootboxDropType`, referenceId Int?, probability Float 0..1, isActive Boolean, createdBy,
createdAt) e `lootbox_openings` (id, userId, openSource `LootboxOpenSource`, costPoints
Int, drops Json, openedAt, tierBoostExpiresAt DateTime?), alem de `users.freeLootboxKeys`
(ja na Etapa 2). `@@unique([userId, openedAt])` nao se aplica; indice `@@index([userId, openedAt])`.
Sem `db push`.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC5.1 — Config por POST substitui a tabela ativa (upsert desnormalizado): valida
      `probability` 0..1, soma <= 1, `referenceId` existente por `dropType`
      (BADGE→badge ativo, REWARD_DRAFT→reward `available`, TIER_BOOST→null); `isActive`
      desliga sem delete (AC-04-10).
- [ ] DC5.2 — Roll ponderado puro em `lootbox.engine.ts`; peso restante vira
      `SEM_REWARD`; BADGE duplicado rerolla ate 3x com pool restante e cai em consolacao
      de **store points** (nunca XP) (AC-04-11).
- [ ] DC5.3 — Abertura por store points debita `costPoints` (default 100) e **nunca** leva
      `users.points` a negativo (erro 400 "Pontos insuficientes"); grava `lootbox_openings`
      com `drops` aplicados (AC-04-12).
- [ ] DC5.4 — Abertura por marco de XP consome 1 `freeLootboxKeys`; sem key → erro; a
      abertura **nao** altera `users.xp` (AC-04-12, invariante 04-13).
- [ ] DC5.5 — `TIER_BOOST` grava `tierBoostExpiresAt = now + 7d` e aparece na progressao
      (get-user-progression); `REWARD_DRAFT` grava voucher em `drops` sem tocar
      `rewards`/`purchases` (AC-04-13).
- [ ] DC5.6 — Loja intacta: nenhuma mudanca em `rewards`/`purchases` schema nem nas rotas
      de compra (AC-04-14).

**Gates desta etapa:** G1/G2/G3 para arquivos da etapa · G4 `docker compose up -d postgres && npx vitest run` · G5 `npx prisma migrate dev --name add_lootbox_drop_configs_and_openings`.

### Etapa 6 — UI (progress bar + tier badge + ranking) e mirrors de feature flag

**Objetivo** — Visibilidade de gamificacao sem mudar enforcement (backend continua a
autoridade): mirrors `VIEW_PROGRESSION` (todos autenticados) e `MANAGE_LOOTBOX`
(=`MANAGE_REWARDS`), progress bar de XP/level, tier badge, abertura de lootbox e
ranking por XP no dashboard — nada visivel sem o mirror.

**Arquivos a criar/alterar (caminhos completos):**

```
- lib/auth/features.ts                                              (ADICIONA VIEW_PROGRESSION: todos os roles; MANAGE_LOOTBOX: [COORDENADOR, GERENTE, LABORATORISTA])
- components/features/gamification/progression-card.tsx             (NOVO: barra de progresso level/xp/nextLevelXp + tier badge + pontos (loja))
- components/features/gamification/tier-badge.tsx                   (NOVO: chip de tier com cor da TIER_TABLE; opcional tierBoost)
- components/features/gamification/lootbox-open-dialog.tsx          (NOVO: dialogo de abertura + resultado do drop)
- app/(dashboard)/dashboard/profile/page.tsx                        (passa a montar ProgressionCard gatilhado por VIEW_PROGRESSION)
- app/(dashboard)/dashboard/leaderboard/page.tsx                    (ranking passa a ordenar por xp desc com nivel/tier; points como metrica secundaria)
- app/(dashboard)/dashboard/loja/...                                (se houver painel de lootbox admin, gatilho MANAGE_LOOTBOX)
- tests/unit/lib/auth/gamification-features-parity.test.ts          (NOVO: VIEW_PROGRESSION/MANAGE_LOOTBOX espelham sets RBAC)
- tests/unit/components/gamification/progression-card.test.tsx      (NOVO: render com/sem VIEW_PROGRESSION, AC-04-15)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC6.1 — `VIEW_PROGRESSION` (todos `Role[]`) e `MANAGE_LOOTBOX` (set `= MANAGE_REWARDS`)
      presentes em `features.ts`; teste de paridade com `PERMISSIONS` (AC-04-15).
- [ ] DC6.2 — `ProgressionCard` renderiza XP/level/tier e badges so com `VIEW_PROGRESSION`;
      creditos `store points` exibidos como moeda (nunca como XP) (AC-04-15).
- [ ] DC6.3 — Leaderboard ordena por `xp desc` com colunas Nivel/Tier; `points` permanece
      exibido como metrica de loja (AC-04-09/16).
- [ ] DC6.4 — Nenhum dado de gamificacao exibido para ator sem o mirror correspondente
      (paridade backend→UI verificada por teste).

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` · `npx tsc --noEmit` · `npx vitest run`.

### Etapa 7 — Testes completos + gates finais (fecha AC-04-16)

**Objetivo** — Rodar a verificacao completa em cadeia, confirmar regressao zero das
baselines (RF-56..58 loja, RF-55 badges, RF-53 progressao) e registrar tudo no `STATE.json`.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/04-deep-gamification/STATE.json     (evidencias, gates, ACs, rollbacks, timeline)
- (revisar) tests/unit/modules/gamification/* + tests/unit/lib/auth/gamification-features-parity.test.ts
```

**Mudancas de schema (se houver):** nenhuma — migracoes das Etapas 2 e 5 ja aplicadas.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC7.1 — G1 verde (exit 0) para todos os arquivos alterados.
- [ ] DC7.2 — G2 verde (`npx tsc --noEmit`, 0 errors).
- [ ] DC7.3 — G3 verde: baseline **256/257** (unico fail conhecido `floating-session-timer`)
      + todos os testes novos verdes.
- [ ] DC7.4 — Suites existentes de RF-53/55/56/57/58 sem regressao (AC-04-14): testes de
      `app/api/purchases`, `app/api/rewards`, badges e progressao antiga seguem verdes.
- [ ] DC7.5 — `STATE.json` atualizado: `acceptanceCriteria` com status
      (pending/verified), `gates` final, `evidence[]` (comandos e saidas), `timeline`.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>        # G1
npx tsc --noEmit                                                                    # G2
npx vitest run                                                                      # G3 (256/257; unico fail conhecido floating-session-timer)
docker compose up -d postgres && npx vitest run                                    # G4 (schema/DB tocados)
npx prisma migrate dev                                                             # G5 (sem db push)
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para o cache em `STATE.json` (secao `rollbacks`) — motivo + acao tomada.
- Em schema ja migrado: `npx prisma migrate resolve`/rollback manual so com aval do dono
  (nunca `db push`).

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `04` como `done`:

- [ ] Todos os gates (G1–G5) verdes — ao contrario de `01`, esta feature **toca schema**
- [ ] Todas as AC-04-01..AC-04-16 da SPEC com teste/evidencia mapeada
- [ ] Migracoes versionadas (`add_users_xp_level`, `add_lootbox_drop_configs_and_openings`) sem `db push`
- [ ] STATE.json atualizado (eventos, evidencias, rollbacks, decisions)