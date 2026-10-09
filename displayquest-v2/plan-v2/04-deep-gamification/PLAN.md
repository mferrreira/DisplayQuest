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

**Revisao 2026-10-01** adiciona tres blocos ao escopo:

- **Etapa 0 (pre-requisito)** — **ligar** o motor de badge automatico (`RF-04.09`). Hoje
  `evaluateUserBadges` e instanciado e nunca invocado (SPEC §2.2): o badge por regra nao
  existe em producao, e RF-04.05/RF-04-EXT-02 dependem dele.
- **Etapas 8–9** — **pacotes de badges instalaveis** (`RF-04-EXT-04..08`): entidade
  `badge_packs`, instalacao por **toggle referenciado** (sem clonar), **criterios ricos v2**
  (arvore de condicoes; o v1 flat segue intocado) e **modificadores** por pacote. Alvo de
  referencia do dono: **4 pacotes de 20 badges**, com icones, criterios e particularidades.
- **Etapa 10** — UI de pacotes e de criterios, no perfil visual vigente (binding de
  `plan-v2/UI-UX.md`).

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

### Etapa 0 — Ligar o motor de badge automatico (RF-04.09) · **PRE-REQUISITO**

**Objetivo** — Dar chamador de producao ao `evaluateUserBadges`, hoje instanciado e nunca
invocado (SPEC §2.2). Roda **rolling no mesmo request do award**, junto da re-avaliacao de
nivel/tier (D-04-02). Sem esta etapa, RF-04.05 (`BADGE_XP`) e o drop `BADGE` de RF-04-EXT-02
**nao tem produtor**, e o AC-04-17 nunca fecha.

> **Por que Etapa 0 e nao uma Etapa no fim.** O bug e "a correcao existe e nao roda". Deixar
> a ligation para depois das Etapas 2/4/5 faz o trabalho de `users.xp` nascer validado por um
> motor morto — e foi exatamente assim que QUIRK-6A escapou: o roundtrip passou, dando
> confianca falsa. A Etapa 0 e **barata** (nenhum schema, nenhuma migration) e **desbloqueia
> a validação real** de tudo que vier depois.

**Decisao de wiring (D-04-11)** — *intra-modulo*, recomendada:

```ts
// backend/modules/gamification/application/use-cases/award-from-work-session.use-case.ts
// (idem em award-from-task-completion.use-case.ts)
const result = await this.gateway.awardFromWorkSession(command);
if (!command.alreadyAwarded) {
  await this.evaluateUserBadges.execute({ userId: command.userId });  // falha engolida
}
return result;
```

| Criterio | **A · intra-modulo (escolhida)** | B · porta `GamificationAwardsPort` |
|---|---|---|
| Garantia "award ⇒ avalia badge" | **estrutural** — segue de dentro do use-case | **nao estrutural** — cada publisher pode esquecer |
| Arquivos tocados | 2 use-cases + composition root | 2 modulos + 2 publishers + composition root |
| Risco da classe de bug que estamos corrigindo | **impossivel** (o caminho e o unico) | **reintroduzivel** (caminho novo sem a chamada) |
| Passa G0? | sim (nenhuma regra proibe use-case→use-case no mesmo modulo) | sim |
| Orquestracao visivel no event layer | nao | sim |

A alternativa B foi descartada porque reintroduz exatamente a falha que esta etapa existe
para eliminar: uma garantia que depende de cada publisher lembrar de chamar. Se a decisao do
dono for B, registrar em `STATE.decisions[]` e o DC0.3 passa a exigir o teste por publisher.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/gamification/application/use-cases/award-from-work-session.use-case.ts  (+ evaluateUserBadges pos-award)
- backend/modules/gamification/application/use-cases/award-from-task-completion.use-case.ts (+ idem)
- backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case.ts      (idempotencia explicita: nao-DD de dominio e engolido; devolve contagem de concedidos)
- backend/modules/gamification/index.ts                                                    (injeta o use-case de avaliacao nos dois use-cases de award; hoje so exposto no bundle)
- tests/unit/modules/gamification/badge-engine-wiring.test.ts                                (NOVO, AC-04-17)
- tests/integration/badge-engine-roundtrip.test.ts                                          (NOVO: award real -> badge concedido no mesmo request)
```

**Mudancas de schema (se houver):** nenhuma. Nenhuma migration.

**Ordem dentro do lote:** ligar `evaluate-user-badges` → injetar em `award-from-work-session`
→ injetar em `award-from-task-completion` → teste. Um commit por passo.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC0.1 — `grep -rn "evaluateUserBadges" app/ backend/` mostra **chamadas** (nao apenas
      `index.ts:73,108` de instanciacao). Registra-se o `file:line` no `STATE.evidence`.
- [ ] DC0.2 — `badge-engine-wiring.test.ts`: dado badge ativo com criterio satisfeito, um
      `awardFromTaskCompletion` produz `user_badges` **e** o `+BADGE_XP` no mesmo request
      (AC-04-17).
- [ ] DC0.3 — Idempotencia: dois awards consecutivos (ou um replay `alreadyAwarded`) nao
      concedem a mesma badge duas vezes nem duplicam XP (dedup `@@unique([userId, badgeId])`).
- [ ] DC0.4 — **Falha engolida**: um port de `UserBadgePort` que lanca erro deixa o award
      aplicado (`users.xp`/`users.points` intactos) e o erro registrado — o award nunca
      reverte (AC-04-17 / RF-04.09 regra 1).
- [ ] DC0.5 — `awardBadge` (concessao manual) e `evaluateUserBadges` **nao** se reentram: um
      unico caminho concede `+BADGE_XP` (RF-04.09 regra 5).
- [ ] DC0.6 — **Sem regressao**: `npx vitest run tests/unit/modules/gamification` verde; em
      particular `contract.gamification.test.ts` (contract 6.3) e os goldens continuam
      verdes — a Etapa 0 **nao** toca `infrastructure/legacy-engines/`.
- [ ] DC0.7 — **G0** `npm run arch:check` exit 0 com allow-list **vazia**: nenhum import
      cruzado novo (o wiring e intra-modulo).

**Gates desta etapa:** `npm run arch:check` (G0) · `npx eslint --no-eslintrc --config .eslintrc.json <arquivos da etapa>` · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/gamification` · G4 roundtrip no banco de teste isolado (5433).

**Risco a medir (vai para `STATE.blockers[]`):** a avaliacao agrega stats do usuario
(`UserStatsPort`) **por award**. Em `04`, com ~80 badges no catalogo ativo, isso e o custo
por evento de `awardFromTaskCompletion`/`awardFromWorkSession`. Medir com o catalogo real
antes de fechar o AC-04-17; se o custo incomodar, o filtro por eixo dependente
(`criteria-v2` com indice eixo→gatilho) e o caminho de reserva — ver `STATE.blockers[]` B4.

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
- backend/domain/gamification/progression-level.ts                        (NOVO: funcao pura getLevelByXp, mantem LEVEL_XP_STEP=100)
- backend/domain/gamification/progression-tier.ts                         (NOVO: funcao pura getTierByXp com TIER_TABLE fixa)
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
- backend/domain/gamification/progression-level.ts   (refinar: exporta getLevelByXp, LEVEL_XP_STEP)
- backend/domain/gamification/progression-tier.ts    (refinar: TIER_TABLE + getTierByXp + proximidade/next)
- tests/unit/modules/gamification/level-engine.test.ts          (NOVO: matriz de limiares, AC-04-04)
- tests/unit/modules/gamification/tier-engine.test.ts           (NOVO: faixas, nextTier, bordas negativas/zero, AC-04-05)
```

**Mudancas de schema (se houver):** nenhuma.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC3.1 — `progression-level.ts` e `progression-tier.ts` sao funcoes puras em
      `backend/domain/**` (sem import de prisma/repositorio/modulo — RG-01/RG-03;
      tipadas com `TierId` de `contracts`/engine).
- [ ] DC3.2 — Tabela de tier fixa documentada: bordas de cada faixa e `nextTier`
      (AC-04-05).
- [ ] DC3.3 — Testes verdes em isolamento:
      `npx vitest run tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts`.

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json backend/domain/gamification/progression-level.ts backend/domain/gamification/progression-tier.ts tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts` · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/gamification/level-engine.test.ts tests/unit/modules/gamification/tier-engine.test.ts`.

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

### Etapa 8 — Schema de pacotes + criterios ricos v2 (RF-04-EXT-04/06)

**Objetivo** — Introduzir a entidade `badge_packs` com `badges.packId` (nullable) e
`badges.criteriaVersion`, e o avaliador **puro** da arvore de condicoes v2. O formato v1
(7 campos flat + `specialCondition` por substring) fica **intocado** — coberto pelos goldens.

**Arquivos a criar/alterar (caminhos completos):**

```
- prisma/schema.prisma                                                          (+ model badge_packs, + model badge_pack_installs; badges: + packId Int?, + criteriaVersion Int @default(1))
- prisma/migrations/<timestamp>_add_badge_packs_and_criteria_v2/                  (G5: `npx prisma migrate dev --name add_badge_packs_and_criteria_v2`)
- backend/domain/gamification/badge-criteria.ts                                  (NOVO, PURO: type BadgeCriteriaV2, AXES/OPERATORS fechados, parse/validateCriteriaV2, evaluateCriteriaV2 — sem I/O, `now` por parametro — RG-01)
- backend/domain/gamification/badge-rules.ts                                     (+ despacho por criteriaVersion; caminho v1 NAO se altera)
- backend/modules/gamification/application/contracts.ts                          (+ BadgePack, BadgePackModifiers, BadgeCriteriaV2 re-export; + criterios de listar/publicar pacote)
- backend/modules/gamification/application/ports/badge-catalog.port.ts           (+ listPacks/getPack/publishPack; + listEligibleBadges filtrando pacote instalado)
- backend/modules/gamification/infrastructure/repositories/prisma-badge-catalog.port.ts (impl Prisma das leituras/escritas de pacote)
- backend/modules/gamification/application/use-cases/badge-management.use-cases.ts (+ CreateBadgePack/UpdateBadgePack/ListBadgePacks/GetBadgePack)
- tests/unit/modules/gamification/badge-criteria-v2.test.ts                       (NOVO, AC-04-20: arvore, bordas, eixo/comparador desconhecido)
- tests/unit/modules/gamification/badge-criteria-v1-compat.test.ts                (NOVO, AC-04-21: v1 intocado, quirk de threshold 0)
- tests/unit/modules/gamification/badge-packs.use-cases.test.ts                   (NOVO, AC-04-18/19)
- tests/integration/badge-packs-roundtrip.test.ts                                 (NOVO, AC-04-18, G4 no banco isolado 5433)
```

**Mudancas de schema (se houver):** `badge_packs` (id, `key` unique, name, description,
icon?, color?, theme?, version Int default 1, modifiers Json?, isPublished, createdBy,
createdAt, `@@index([isPublished])`); `badge_pack_installs` (id, packId, installedBy,
installedAt, `@@unique([packId])`); `badges` ganha `packId Int?` (relation
`"BadgePackBadges"`, opcional — badge avulso segue `null`) e
`criteriaVersion Int @default(1)`. **Sem `db push`.** `badges` **nao** e clonada.

**Contrato a implementar (decisoes D-04-09/D-04-10/D-04-12):**

```ts
// backend/domain/gamification/badge-criteria.ts — puro, sem I/O
type CriteriaNode =
  | { all: CriteriaNode[] } | { any: CriteriaNode[] } | { not: CriteriaNode }
  | { axis: BadgeAxis; op: BadgeOperator; value: number | string | string[] };
// eixos FECHADOS: xp, points, completedTasks, projectsCount, workSessionsCount,
//   averageWeeklyHours, maxConsecutiveDays, level, tierRank,
//   projectId, taskId, dailyLogId, occurredAt, roles, specialCondition
// operadores FECHADOS por eixo; specialCondition: op "is" = IGUALDADE sobre enum
validateCriteriaV2(json: unknown): Result<CriteriaNode, ValidationError>  // 400 na autoria
evaluateCriteriaV2(node: CriteriaNode, ctx: BadgeUserStats, now: Date): boolean
// profundidade maxima 3 niveis; validate rejeita acima disso
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC8.1 — `npx prisma migrate dev --name add_badge_packs_and_criteria_v2` gera versao;
      `npx prisma migrate status` limpo; `badges.criteriaVersion` = 1 em **todas** as linhas
      existentes (sem backfill de formato).
- [ ] DC8.2 — `badge-criteria.ts` e puro: `npm run arch:check` verde (G0) e o arquivo nao
      importa prisma, repositorio, modulo ou `Date.now()` (RG-01).
- [ ] DC8.3 — `validateCriteriaV2` rejeita com erro de validacao (nao `false`) eixo ou
      comparador desconhecido, arvore com mais de 3 niveis e `specialCondition` fora do enum;
      o roundtrip da rota devolve **400** com o caminho do nó invalido (AC-04-20).
- [ ] DC8.4 — `evaluateCriteriaV2` compõe `all`/`any`/`not` corretamente e trata
      `specialCondition` por **igualdade** (nao por `includes`) — o mini-DSL em portugues
      (`badge-rules.ts:164-189`) nao e tocado (AC-04-20).
- [ ] DC8.5 — Despacho por `criteriaVersion`: badge com `1`/ausente segue pelo motor v1
      **bit a bit**; badge com `2` nunca cai no v1 nem no contrario — sem fallback
      silencioso (AC-04-21).
- [ ] DC8.6 — Roundtrip G4: criar pacote P, criar badge com `packId=P`, confirmar
      `badges.count` **inalterado** por qualquer operacao de pacote e `user_badges` de
      usuarios reais intactas (AC-04-18).
- [ ] DC8.7 — **Nao-regressao**: `npx vitest run tests/unit/modules/gamification` verde,
      incluindo `contract.gamification.test.ts` e os goldens (AC-04-21).

**Gates desta etapa:** `npm run arch:check` (G0) · G1 nos arquivos da etapa · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/gamification` · G4 `DATABASE_URL=...@127.0.0.1:5433/dq_dev_test npx vitest run tests/integration/badge-packs-roundtrip.test.ts` · G5 `npx prisma migrate dev --name add_badge_packs_and_criteria_v2`.

### Etapa 9 — Instalar/desinstalar + modificadores + invariantes (RF-04-EXT-05/07/08)

**Objetivo** — Toggle de instalacao **referenciado** (sem clonar badges), modificadores de
XP por pacote ("particularidades") e o conjunto de invariantes que torna a operacao segura
sobre historico real.

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/domain/gamification/pack-modifiers.ts                                 (NOVO, PURO: enum PackModifier, PACK_MODIFIER_TABLE, resolveModifiers, applyModifiers — sem I/O; `now` por parametro)
- backend/modules/gamification/application/contracts.ts                          (+ InstallBadgePackCommand, ResolvedModifiers)
- backend/modules/gamification/application/ports/badge-catalog.port.ts           (+ installPack/uninstallPack/listInstalledPackIds)
- backend/modules/gamification/infrastructure/repositories/prisma-badge-catalog.port.ts (+ toggle em badge_pack_installs)
- backend/modules/gamification/application/use-cases/badge-management.use-cases.ts (+ InstallBadgePack/UninstallBadgePack)
- backend/modules/gamification/infrastructure/prisma-gamification.gateway.ts       (applyAward consulta modificadores do catalogo instalado antes de creditar xp; xp truncado, nunca negativo)
- app/api/gamification/badge-packs/route.ts                                       (NOVO: GET catalogo, POST criar/publicar)
- app/api/gamification/badge-packs/[key]/route.ts                                 (NOVO: GET detalhe, PATCH metadados/version/modifiers/isPublished)
- app/api/gamification/badge-packs/[key]/install/route.ts                          (NOVO: POST instalar / DELETE desinstalar)
- lib/auth/rbac.ts + lib/auth/features.ts                                          (ADICIONA MANAGE_BADGE_PACKS = [COORDENADOR, GERENTE]; mirror espelhando PERMISSIONS)
- tests/unit/modules/gamification/pack-modifiers.test.ts                           (NOVO, AC-04-22)
- tests/unit/modules/gamification/badge-packs.route.test.ts                         (NOVO, AC-04-19: thin adapter, 400/403/404)
- tests/unit/modules/gamification/pack-invariants.test.ts                           (NOVO, AC-04-23)
- tests/unit/lib/auth/gamification-features-parity.test.ts                          (REVISADO: inclui MANAGE_BADGE_PACKS)
```

**Mudancas de schema (se houver):** nenhuma (a tabela ja nasce na Etapa 8). Sem `db push`.

**Contrato a implementar (D-04-13):**

```ts
// backend/domain/gamification/pack-modifiers.ts — puro
type PackModifierName = "SESSION_XP_MULTIPLIER_NIGHT" | "TASK_XP_BONUS_ROLE" | "BADGE_XP_OVERRIDE";
resolveModifiers(packs: BadgePack[], ctx: AwardContext, now: Date): { xpMultiplier: number; flatBonus: number }
// limites: multiplicador em 0.5..2.0; no maximo 2 modificadores empilham; faixa horaria
// avaliada em America/Sao_Paulo; resultado TRUNCADO e nunca negativo
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC9.1 — `POST .../install` grava **exatamente 1** linha em `badge_pack_installs`;
      repetir nao duplica; `badges.count` **inalterado** antes/depois (RF-04-EXT-05 regra 1/4)
      (AC-04-18/19).
- [ ] DC9.2 — `DELETE .../install` remove a linha e **nao** apaga badges, nao apaga
      `user_badges` e nao altera `users.xp` (AC-04-19/23).
- [ ] DC9.3 — Instalar badge **avulso** (`packId=null`) → **400**; ator sem
      `MANAGE_BADGE_PACKS` → **403**; `key` inexistente → **404** (AC-04-19).
- [ ] DC9.4 — `isPublished=false` esconde o pacote do catalogo, **nao** desinstala e
      **nao** apaga badges (eixos independentes — RF-04-EXT-04 regra 4).
- [ ] DC9.5 — Modificador noturno: sessao 22:00–06:00 America/Sao_Paulo com
      `SESSION_XP_MULTIPLIER_NIGHT: 1.5` e 20 xp → **30**; a mesma sessao de dia → **20**
      (AC-04-22).
- [ ] DC9.6 — Modificador **nunca** mexe em `users.points`; multiplicador fora de
      `0.5..2.0`, 3+ modificadores simultaneos ou nome desconhecido → rejeitado na autoria /
      ignorado sem quebrar o award (AC-04-22).
- [ ] DC9.7 — Badge de pacote **desinstalado** nao e concedido por `evaluateUserBadges`;
      apos reinstalar, os badges ja conquistados **nao** voltam a ser concedidos nem geram XP
      retroativo (AC-04-23 / D-04-07).
- [ ] DC9.8 — Rotas **thin adapters**: sem regra de negocio, erro de dominio mapeado por
      `domainErrorResponse` (Validation→400, NotFound→404, Forbidden→403) (AC-04-19).
- [ ] DC9.9 — G0 verde: `MANAGE_BADGE_PACKS` em `features.ts` espelha `PERMISSIONS`; nenhum
      import cruzado novo; allow-list segue **vazia**.

**Gates desta etapa:** `npm run arch:check` (G0) · G1 nos arquivos da etapa · `npx tsc --noEmit` · `npx vitest run tests/unit/modules/gamification tests/unit/lib/auth`.

### Etapa 10 — UI de pacotes e de criterios, no perfil visual vigente

**Objetivo** — Vitrine publica de pacotes, gesto de instalar/desinstalar para quem tem o
mirror, e um editor de criteria em arvore (v2) no lugar do form de 7 campos. **Sem** criar
um segundo design system: consome `plan-v2/UI-UX.md` e os primitivos ja existentes
(`components/ui/card.tsx`, `badge.tsx`, `progress.tsx`, `dialog.tsx`, `popover.tsx`).

**Arquivos a criar/alterar (caminhos completos):**

```
- components/features/gamification/badge-pack-card.tsx           (NOVO: card no grid 1/2/3 de 6, icone + nome + tema + contador + chip "instalado")
- components/features/gamification/badge-pack-gallery.tsx        (NOVO: vitrine; card de pacote so para published+installed; badge avulso em secao propria)
- components/features/gamification/criteria-tree-editor.tsx     (NOVO: arvore all/any/not + seletor de eixo/operador; recusa eixo invalido no proprio editor)
- components/features/gamification/progression-card.tsx          (ETAPA 6,adjusted: passa a mostrar badge won por regra + pacote de origem)
- components/admin/badge-manager.tsx                            (mantem edicao v1; adiciona seletor de pacote e o link pro editor v2)
- contexts/api-client.ts                                        (+ BadgePacksAPI: list/get/create/update/install/uninstall)
- entities/badge.ts                                             (+ badgePackSchema, badgePackInstallSchema; `criteria` permanece z.unknown() — o formato e do dominio)
- app/(dashboard)/dashboard/profile/page.tsx                     (monta a galeria sob o mirror MANAGE_BADGE_PACKS)
- app/(dashboard)/dashboard/admin/page.tsx                       (entrada de "Pacotes de badges" sob o mirror)
- tests/unit/components/gamification/badge-pack-card.test.tsx     (NOVO, AC-04-24)
- tests/unit/components/gamification/criteria-tree-editor.test.tsx (NOVO, AC-04-24)
```

**Mudancas de schema (se houver):** nenhuma.

**Regras de perfil visual (binding — `plan-v2/UI-UX.md` §2/§3):** tokens semanticos
(`--primary`, `--success`, `--warning`, `--info`, `--destructive`) e **nunca** cor crua nova;
`--radius: 0.75rem` com a escala ja derivada (`radius-lg/md/sm`); grid de cards
`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` (o mesmo do `badge-manager.tsx:366`);
tinta de categoria de badge preservada (`badge-manager.tsx:58-61`); **dark mode** com par
claro/escuro por categoria; **contraste** conferido como no kanban (AGENTS.md). Nenhuma
cor hardcoded fora dos tokens.

**Done criteria desta etapa (todas observaveis):**
- [ ] DC10.1 — `badge-pack-card` renderiza icone/nome/tema/contador e o chip de instalado;
      nao renderiza pacote nao publicado nem badge de pacote desinstalado (AC-04-24).
- [ ] DC10.2 — O gesto de instalar/desinstalar so aparece sob `MANAGE_BADGE_PACKS`; sem o
      mirror a vitrine e somente-leitura (paridade backend→UI por teste) (AC-04-24).
- [ ] DC10.3 — `criteria-tree-editor` monta `all`/`any`/`not`, bloqueia eixo/operador
      invalido **na UI** (antes de 400 do backend) e emite o JSON v2 esperado (AC-04-20/24).
- [ ] DC10.4 — Nenhum token novo fora de `app/globals.css`; nenhuma cor hex/rgb literal nos
      componentes novos (conferido por `grep -nE "#[0-9a-fA-F]{3,8}|rgb\\(" <arquivos>`).
- [ ] DC10.5 — O `badge-manager.tsx` existente continua funcionando para badges v1/avulsos
      (nao-regressao do admin).
- [ ] DC10.6 — G0/G1/G2/G3 verdes; testes de componente novos verdes (shims de Radix de
      `tests/setup.ts` preservados — sem `hasPointerCapture`/`ResizeObserver` o editor nao
      abre em jsdom).

**Gates desta etapa:** `npm run arch:check` (G0) · G1 nos arquivos da etapa · `npx tsc --noEmit` · `npx vitest run tests/unit/components/gamification`.

### Etapa 11 — Testes completos + gates finais (fecha AC-04-25)

**Objetivo** — cadeia completa de G0..G5, prova de nao-regressao das baselines (loja
RF-56..58, badge manual RF-55, progressao RF-53) e registro no `STATE.json`.

**Arquivos a criar/alterar (caminhos completos):**

```
- plan-v2/04-deep-gamification/STATE.json     (decisions D-04-09..13, blockers B4..B6, evidence, gates, ACs, timeline)
- (revisar) tests/unit/modules/gamification/* + tests/unit/lib/auth/gamification-features-parity.test.ts
```

**Done criteria desta etapa (todas observaveis):**
- [ ] DC11.1 — **G0** `npm run arch:check` exit 0 com allow-list **vazia**.
- [ ] DC11.2 — **G1** `npx eslint --no-eslintrc --config .eslintrc.json <todos alterados>` exit 0.
- [ ] DC11.3 — **G2** `npx tsc --noEmit` 0 errors.
- [ ] DC11.4 — **G3** `npx vitest run`: baseline verificada **67 arquivos / 1245 testes,
      zero failure** + todos os novos verdes (a contagem so cresce).
- [ ] DC11.5 — **G4** roundtrips no banco **isolado** `dq-dev-test-db` em
      `127.0.0.1:5433` (`gamification-xp-roundtrip`, `badge-engine-roundtrip`,
      `badge-packs-roundtrip`) verdes. **Nunca** contra `display-quest-db` (5432).
- [ ] DC11.6 — **G5** 3 migracoes versionadas (`add_users_xp_level`,
      `add_lootbox_drop_configs_and_openings`, `add_badge_packs_and_criteria_v2`), zero
      `db push`; `npx prisma migrate status` limpo.
- [ ] DC11.7 — `STATE.json` com `acceptanceCriteria` AC-04-01..25 com status, `gates`
      final, `evidence[]` (comando + saida), `timeline` e as decisoes D-04-09..13.

## 4. Verificacao (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npm run arch:check                                                                # G0 (allow-list vazia)
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>        # G1
npx tsc --noEmit                                                                    # G2
npx vitest run                                                                      # G3 (67 arquivos / 1245 testes, zero failure)
export DATABASE_URL="postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test"
npx vitest run tests/integration                                                   # G4 (roundtrips; banco ISOLADO, nunca 5432)
npx prisma migrate dev                                                             # G5 (sem db push)
```

> **Ordem das etapas:** `0` (motor de badge ligado — pre-requisito) → `1`..`7` (escopo
> original) → `8` (schema de pacotes + criterios v2) → `9` (install + modificadores +
> invariantes) → `10` (UI) → `11` (gates finais). A Etapa 0 e a unica que **precisa** vir
> antes das demais: as Etapas 4 e 5 assumem um motor de badge que exista e rode.

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; nao siga adiante.
- **Depois** volte a SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para o cache em `STATE.json` (secao `rollbacks`) — motivo + acao tomada.
- Em schema ja migrado: `npx prisma migrate resolve`/rollback manual so com aval do dono
  (nunca `db push`).

## 6. Entregaveis de conclusao

Checklist que, tudo verde, marca `04` como `done`:

- [ ] Todos os gates (**G0–G5**) verdes — ao contrario de `01`, esta feature **toca schema**
- [ ] Todas as AC-04-01..**AC-04-25** da SPEC com teste/evidencia mapeada
- [ ] **O motor de badge automatico roda em producao** (Etapa 0 fechada) — badge por regra
      concedido sem mao, e nao so no fake de teste
- [ ] 3 migracoes versionadas (`add_users_xp_level`,
      `add_lootbox_drop_configs_and_openings`, `add_badge_packs_and_criteria_v2`) sem
      `db push`
- [ ] Nenhum badge existente migrou de formato de criterio (`criteriaVersion=1`) — o motor
      v1 e os goldens seguem intactos
- [ ] `badges` nunca foi clonada por operacao de pacote (toggle referenciado)
- [ ] UI conforme `plan-v2/UI-UX.md`, sem token de cor novo
- [ ] STATE.json atualizado (eventos, evidencias, rollbacks, decisions D-04-09..13)