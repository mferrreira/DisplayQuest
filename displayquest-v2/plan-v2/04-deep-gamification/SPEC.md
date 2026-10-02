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

Esta revisao (2026-10-01) adiciona tres blocos:

1. **RF-04.09 — motor de badge automatico ligado.** A correcao QUIRK-6A (o badge por regra
   passou a ser concedido de fato) **esta inerte**: `evaluateUserBadges` e instanciado em
   `backend/modules/gamification/index.ts:73,108` mas **nao e invocado** por rota, evento
   nem cron. RF-04.05 (badge que da XP) e RF-04-EXT-02 (drop `BADGE`) dependem de um motor
   que nunca roda; este RF amarra a avaliacao ao award (rolling).
2. **RF-04-EXT-04..08 — pacotes de badges instalaveis.** O gargalo real de criacao de
   badges hoje e o vocabulario de criterios: 7 campos numericos fixos + `specialCondition`
   avaliado por **substring em portugues**. Pacotes (RF-04-EXT-04) exigem criterios ricos
   (RF-04-EXT-06) e particularidades por pacote (RF-04-EXT-07).
3. **Contrato visual** transversal em `plan-v2/UI-UX.md`, binding desta e das demais
   features (01..06).

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
- **Badges** — a linha de base desta feature foi reescrita pelo clean-arch; os caminhos
  citados abaixo sao os **atuais** (ver §2.1). Regras puras em
  `backend/domain/gamification/badge-rules.ts` (`badgeCriteriaMet`, `selectBadgesToAward`,
  `maxConsecutiveDaysFrom`, `averageWeeklyHoursFrom`) e
  `backend/domain/gamification/Progression.ts` (`computeUserProgression`, `levelForXp`,
  `eloForXp`, `LEVEL_XP_STEP`, `ELO_THRESHOLDS`). Contratos puros em
  `backend/domain/gamification/Badge.ts` (`BadgeCriteria`, `BadgeCategory`).
  O engine legado sobrevive **apenas como seam de golden/contract test** em
  `backend/modules/gamification/infrastructure/legacy-engines/badge-rules.engine.ts`
  (DEC-15/DEC-19; nao e usado pela wiring de producao).
  Tabelas `badges` (`prisma/schema.prisma:327-340`) e `user_badges` (`:342-353`,
  `@@unique([userId, badgeId])` em `:352`), sem XP associado.
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
`app/(dashboard)/dashboard/leaderboard/page.tsx:27-30`); (5) sem lootbox (D-04-03);
(6) **motor de badge automatico inerte** (ver §2.2); (7) **vocabulario de criterio
impede pacotes** (ver §2.3).

### 2.1 Correcao de caminhos desta SPEC (clean-arch)

Os "Fronteira" de RF-04.03/04/05 e as Etapas 2/3 do PLAN citavam
`backend/modules/gamification/domain/engines/{level,tier,badge-rules}.engine.ts`, caminho
que **nao existe** desde o clean-arch. Regras puras vao para `backend/domain/**` (core sem
I/O, RG-01); use-cases em `backend/modules/<m>/application/use-cases/`; adapters Prisma em
`backend/modules/<m>/infrastructure/`. `level.engine.ts`/`tier.engine.ts` **nao existem
ainda** — sao artefatos a criar, e devem nascer em `backend/domain/gamification/`
(`progression-level.ts`, `progression-tier.ts`), nao em `modules/*/domain/`.

### 2.2 Motor de badge automatico inerte (lacuna 6)

`EvaluateUserBadgesUseCase` existe, esta coberto por teste (contract + roundtrip) e
**nao tem chamador de producao**:

```
backend/modules/gamification/index.ts:73,108,119,124,127   <- so instanciacao/exposicao
backend/modules/gamification/application/use-cases/evaluate-user-badges.use-case.ts
```

Nao ha rota, evento, cron ou publisher que o invoque (unico `app/api/cron/*` e
`app/api/cron/status/route.ts`, que nao toca gamificacao). Logo:

- o badge por regra **nunca e concedido em producao**;
- o documentado QUIRK-6A ("a correcao da Onda 6 faz a concessao FUNCIONAR") so se
  manifesta contra fakes de teste;
- RF-04.05 (`BADGE_XP`) e o drop `BADGE` de RF-04-EXT-02 **nao tem produtor**;
- o endpoint de progressao **nao tem consumidor**: nao existe `getGamification` em
  `contexts/api-client.ts` nem chamada a `/api/users/[id]/gamification` em
  `app/(dashboard)`, `components/` ou `features/` — level/elo sao calculados e nunca
  exibidos.

### 2.3 Vocabulario de criterio limita a criacao de badges (lacuna 7)

`BadgeCriteria` (`backend/domain/gamification/Badge.ts:11-19`) e um objeto **flat** com 7
campos numericos opcionais (`points`, `tasks`, `projects`, `workSessions`, `weeklyHours`,
`consecutiveDays`) mais `specialCondition: string`. Limites observados:

1. **Sem composicao** — nao existe AND/OR/NOT entre criterios; tudo e E logico.
2. **`specialCondition` e substring em portugues** —
   `badge-rules.ts:164-189` faz `conditionLower.includes("primeiro") &&
   includes("100")`, `includes("semana perfeita")`, `includes("sequência") &&
   includes("dias")`, `includes("coordenador")`. E um mini-DSL em linguagem natural, sem
   enum: nao ha como inventar uma condicao nova sem **alterar codigo**, e um pacote
   autorado em ingles nunca casa.
3. **Sem eixo de escopo** — nada distingue "20 tasks *neste projeto*", "sessao no periodo
   noturno", "badge para quem eh VOLUNTARIO".
4. **Sem entidade de pacote** — `badges` nao tem `packId`; nao existe `badge_packs`. O
   catalogo e gerido **badge a badge** pelo form de `components/admin/badge-manager.tsx`
   (474 linhas), que expoe exatamente os 7 campos numericos + 1 input de texto livre
   (`updateCriteria(...)`, linhas 283-345).
5. **Sem modificadores** — nao ha nocao de "particularidade" herdada do pacote (ex.: um
   pacote que multiplica XP de sessao noturna).

## 3. Atores e papeis

| Ator | Papel | Interacao |
|---|---|---|
| `VOLUNTARIO`, `COLABORADOR`, `PESQUISADOR`, `GERENTE_PROJETO`, `LABORATORISTA`, `GERENTE`, `COORDENADOR` | Qualquer autenticado | Consome/progressa (awards automáticos), consulta a propria progressao (RF-53), ve ranking por XP (RF-08), abre lootbox propria |
| `COORDENADOR`, `GERENTE` | Gestores (MANAGE_USERS) | Consultam progressao de qualquer usuario |
| `COORDENADOR`, `GERENTE`, `LABORATORISTA` | Detentores de `MANAGE_REWARDS` | Configuram a tabela de drops de lootbox (RF-04-EXT-01); continuam aprovando compras (RF-58, inalterado) |
| `COORDENADOR`, `GERENTE` | Curadores de `MANAGE_BADGE_PACKS` | Publicam/despublicam pacotes, instalam/desinstalam pacotes no catalogo e autoram badges avulsos fora de pacote (RF-04-EXT-04/05) |
| Sistema / engines | Ator tecnico | Award automatico em task completion, work session e conquista de badge; **re-avaliacao rolling de nivel/tier e avaliacao de badges automaticos no mesmo request do award** (RF-04.09); badges e criterios vem do catalogo instalado (RF-04-EXT-06) |

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

### RF-04.09 — Motor de badge automatico ligado (rolling no award)

- **Descricao:** a avaliacao de badges por regra passa a **rodar**. Hoje
  `evaluateUserBadges` e instanciado e nunca invocado (§2.2); este RF define **quando** a
  avaliacao roda: **rolling, no mesmo request do award**, junto da re-avaliacao de
  nivel/tier ja exigida por D-04-02. Nao ha batch semanal nem cron de badges.
- **Fronteira:** `backend/composition/root.ts` (wiring), modulo `gamification`
  (`evaluate-user-badges.use-case.ts`, `application/ports/gamification-awards.port.ts` do
  `work-execution` e do `task-management`). Sem import cruzado: o disparo entra pela
  **porta local** injetada no composition root (DEC-21), nao por import de modulo.
- **Entradas/Saidas:** sem comando novo. `awardFromTaskCompletion` /
  `awardFromWorkSession` passam a emitir, apos `applyAward`, uma avaliacao de badges para o
  mesmo `userId`.
- **Cenario principal (Gherkin):**
  ```
  Given U nao tem o badge B e B tem criteria { tasks: 1 }, B esta ativo e B pertence a um
        pacote instalado (ou e avulso)
  When  U conclude uma task (award de task aplicado)
  Then  U recebe B em user_badges e +BADGE_XP, no mesmo request
  ```
- **Regras de negocio:**
  1. **Falha nao derruba o award** — o award ja foi aplicado; um erro na avaliacao de
     badge e engolido com `console.error` (padrao da casa, ver
     `evaluate-user-badges.use-case.ts`) e loga em `history`; **nunca** reverte o XP/points.
  2. **Idempotente** — reavaliar sem mudanca de stat nao concede nada novo (dedup por
     `@@unique([userId, badgeId])`).
  3. **Escopo do catalogo** — so sao avaliados badges `isActive` **de pacotes instalados**
     ou **avulsos** (`packId IS NULL`); badge de pacote nao instalado nunca e concedido.
  4. **Um award dispara uma avaliacao** — nao uma por criterio; a avaliacao e o filtro
     completo do catalogo ativo.
  5. **Nao e reentrada** — `awardBadge` (concessao manual) e `evaluateUserBadges` nao se
     chamam mutuamente; o `+BADGE_XP` do RF-04.05 acontece no unico caminho de concessao,
     para nao duplicar XP.

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

### RF-04-EXT-04 — Catalogo de pacotes de badges

- **Descricao:** badges passam a se organizar em **pacotes** (RF novo, D-04-09): um
  conjunto curado de badges com identidade propria (nome, slug, descricao, icone, tema,
  versao). Alvo de referencia: **4 pacotes de 20 badges**, cada um com seus icones, criterios
  e particularidades. `badges.packId` nullable: badge **avulso** (sem pacote) continua
  valendo — o catalogo atual nao quebra.
- **Fronteira:** `prisma/schema.prisma` (`badge_packs`, `badges.packId`),
  `backend/modules/gamification` (use-cases de listar/publicar), rotas
  `app/api/gamification/badge-packs`.
- **Cenario principal (Gherkin):**
  ```
  Given um curador publica o pacote P ("Primeiros Passos", v1, 20 badges, isPublished=true)
  Then  P aparece no catalogo de pacotes; cada badge de P tem packId=P e continua isActive
        conforme autorado; o badge avulso legado (packId=null) segue no catalogo
  ```
- **Regras de negocio:** (1) `badge_packs.key` e unico e **estavel** (identidade em
  `history`/badges ja concedidos nunca aponta para outro pacote); (2) `version` e inteiro
  **declarado pelo autor** e incrementa a cada publicacao — nao e derivado; (3)
  `isPublished=false` esconde o pacote do catalogo **sem** apagar badges nem concessoes;
  (4) despublicar **nao** desinstala (sao eixos independentes — ver RF-04-EXT-05);
  (5) badges de um pacote despublicado **nao concedem novos awards** automaticos, mas os
  ja concedidos permanecem.

### RF-04-EXT-05 — Instalar/desinstalar pacote (referenciado, sem clonar)

- **Descricao:** "instalar" um pacote e **um toggle de referencia**, **nao uma copia**:
  as linhas de `badges` continuam apontando para `badge_packs` e nao sao duplicadas. Desinstalar
  e reversivel e **nao apaga historico**: badges ja conquistados (`user_badges`) sobrevivem.
- **Fronteira:** `badge_pack_installs` (schema), use-cases
  `install-badge-pack`/`uninstall-badge-pack`, rotas `app/api/gamification/badge-packs/[key]/install`.
- **Cenario principal (Gherkin):**
  ```
  Given P publicado e ainda nao instalado
  When  um curador instala P
  Then  existe 1 registro em badge_pack_installs; badges.count e IDENTICO ao de antes
        (nenhuma badge clonada); badges de P passam a ser elegiveis a award automatico
  When  o mesmo curador desinstala P
  Then  o registro e removido; P deixa de conceder novos badges; as user_badges ja
        concedidas de P permanecem e seguem exibidas
  ```
- **Regras de negocio:** (1) `badgeId` e o identidade mantido — clonar produziria badges
  órfãos e `user_badges` apontando para linhas que somem na desinstalacao; (2) desinstalar
  **nao revoga** badges ja conquistados nem o `+BADGE_XP` dado (XP e monotonico,
  D-04-01); (3) desinstalar **nao apaga** o pacote nem seus badges (somente sai do catalogo
  ativo); (4) reinstalar e **idempotente** (2o install sem efeito, sem registro duplicado);
  (5) **badge avulso nao e instalavel** — nao pertence a pacote; (6) no escopo desta versao
  a instalacao e **global** (ver RF-04-EXT-05 regra 7 e §10): nao ha escopo por laboratorio
  porque nao existe `laboratories` — o eixo por lab entra em `05-multi-lab-saas`, que
  adiciona a coluna de escopo sem mudar a semantica do toggle.

### RF-04-EXT-06 — Criterios ricos e compostos (arvore de condicoes)

- **Descricao:** `badges.criteria` ganha um **formato v2** de arvore de condicoes, com
  `badges.criteriaVersion` separando os formatos. O v1 (7 campos flat + `specialCondition`
  por substring em portugues) **permanece valido e e avaliado pelo motor atual**, congelado
  por goldens. O v2 e um **vocabulario fechado** de eixos e operadores, com composicao
  `all`/`any`/`not`.
- **Fronteira:** `backend/domain/gamification/badge-criteria.ts` (**NOVO**, funcoes puras,
  RG-01), avaliador v2 em `backend/domain/gamification/badge-rules.ts`; coluna
  `badges.criteriaVersion`.
- **Eixos fechados do v2** (eixo `: comparador`):
  - acumulado: `xp`, `points`, `completedTasks`, `projectsCount`, `workSessionsCount`,
    `averageWeeklyHours`, `maxConsecutiveDays`, `level`, `tierRank`
  - escopo: `projectId`, `taskId`, `dailyLogId` `: in | eq`
  - tempo: `occurredAt` `: withinDays | inRange | weekday`
  - papel: `roles` `: includes`
  - condicao nomeada: `specialCondition` `: is` — **igualdade sobre um enum**
    (`WORKED_NIGHT_SHIFT`, `MENTOR_APPROVED`, `FIRST_100_TASKS`, `PERFECT_WEEK`,
    `SEVEN_DAY_STREAK`, `IS_COORDINATOR`), **nunca substring**
- **Cenario principal (Gherkin):**
  ```
  Given badge B com criteriaVersion=2 e criteria
        { "version": 2, "all": [ {"axis":"tasks","op":">=","value":10},
                                {"axis":"consecutiveDays","op":">=","value":5},
                                {"any": [ {"axis":"specialCondition","op":"is","value":"WORKED_NIGHT_SHIFT"},
                                          {"axis":"specialCondition","op":"is","value":"MENTOR_APPROVED"} ] } ] }
  Then  B e concedido quando TODOS os termos `all` e pelo menos UM dos termos `any` sao
        satisfeitos; eixo/comparador desconhecido => validacao 400 na autoria, nunca match
        silencioso
  ```
- **Regras de negocio:** (1) `criteriaVersion` ausente/`1` = **formato v1** (motor atual,
  intocado — inclusive o quirk de threshold falsy `0` ser ignorado, que segue valendo);
  (2) `criteriaVersion=2` ativa **apenas** o v2; nao ha hibrido nem fallback silencioso de
  v2 para v1; (3) comparadores sao **fechados**: qualquer par `eixo: comparador`
  desconhecido e erro de validacao na autoria do badge, nunca `false` silencioso;
  (4) `specialCondition` com `op: is` faz **igualdade** sobre o enum — elimina o
  `includes()` frágil e a dependencia de portugues; (5) a arvore e pura: `now` entra por
  parametro, sem I/O; (6) profundidade maxima e `any`/`not` aninhados (limite de 3 niveis,
  validado na autoria) para custo previsivel na re-avaliacao rolling.

### RF-04-EXT-07 — Particularidades do pacote (modificadores)

- **Descricao:** cada pacote pode declarar **modificadores proprios** — as "particularidades"
  que um pacote de badges carrega e que valem para os awards de todo o pacote. Ex.:
  `SESSION_XP_MULTIPLIER` por faixa horaria (noturno), `TASK_XP_BONUS` para um papel,
  `BADGE_XP_OVERRIDE`. Sem isto, "cada pacote com suas particularidades" nao tem onde morar.
- **Fronteira:** `badge_packs.modifiers Json?`, `backend/domain/gamification/pack-modifiers.ts`
  (**NOVO**, funcao pura), `badge_catalog.port.ts` (leitura), `applyAward`.
- **Cenario principal (Gherkin):**
  ```
  Given pacote P instalado com modifiers { "SESSION_XP_MULTIPLIER_NIGHT": 1.5 } e
      sessionsafe noturna (22:00-06:00, America/Sao_Paulo)
  When  U fecha uma sessao de trabalho noturna que rende 20 xp
  Then  U recebe 30 xp (20 x 1.5, truncado) e a sessao diurna com os mesmos 20 xp recebe 20
  ```
- **Regras de negocio:** (1) modificador e **multiplicador/adicao de XP**, nunca de
  `users.points` — moeda de loja nao e afetada por pacote (D-04-01); (2) modificador so se
  aplica a awards **originados depois** da instalacao (sem recalculo retroativo); (3) os
  modificadores nomeados sao um **enum fechado** (tabela em `pack-modifiers.ts`); um
  modificador desconhecido nao e aplicado e nao quebra o award (falha engolida, padrao da
  casa); (4) multiplicadores sao limitado a faixa `0.5 .. 2.0` e empilham por multiplicacao
  (teto de 2 modificadores simultaneos); (5) o resultado e **truncado para inteiro** e
  nunca fica negativo.

### RF-04-EXT-08 — Invariantes de pacote

- **Descricao:** as garantias que make "instalar/desinstalar" seguro quando ha historico e
  badges ja conquistados por usuarios reais.
- **Fronteira:** `backend/modules/gamification` + `prisma/schema.prisma`.
- **Cenario principal (Gherkin):**
  ```
  Given U conquistou 3 badges do pacote P e o XP correspondente
  When  P e desinstalado e depois reinstalado
  Then  users.xp permanece (nao reverteu, nao duplicou), as 3 user_badges permanecem,
        e a proxima avaliacao nao volta a conceder os mesmos badges
  Given o pacote P removido do catalogo com badges concedidos
  Then  nenhuma cascade apaga user_badges (relacao onDelete: Cascade so vale se a badge
        sumir, e remocao de pacote nao remove badges — ver RF-04-EXT-04 regra 3)
  ```
- **Regras de negocio:** (1) `xp` e **monotonico**: desinstalar/reescalar pacote nao
  decrementa XP (D-04-01); (2) **nao ha backfill** — badges ja conquistados antes de uma
  mudanca de pacote nao dao XP retroativo (mesma politica de D-04-07); (3) `user_badges`
  nunca e apagada por operacao de pacote; (4) `@@unique([userId, badgeId])` continua sendo
  a **unica** fonte de dedup — nenhum estado paralelo de "ja evaluatei"; (5) invariante
  testada por suite dedicada.

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

### 6.1 Schema dos pacotes de badges (RF-04-EXT-04..08)

Names snake_case, padrao do repo. Sobrepoe `badges` (`:327-340`); **nao** cria coluna nova
em `users`.

```prisma
model badge_packs {
  id          Int      @id @default(autoincrement())
  key         String   @unique          // identidade estavel (nunca reciclada)
  name        String
  description String
  icon        String?
  color       String?
  theme       String?                    // tag livre de tema (ex.: "noturno", "social")
  version     Int      @default(1)       // declarado pelo autor, incrementa por publicacao
  modifiers   Json?                      // particularidades do pacote (RF-04-EXT-07)
  isPublished Boolean @default(false)
  createdBy   Int
  createdAt   DateTime @default(now())
  badges      badges[] @relation("BadgePackBadges")

  @@index([isPublished])
}

model badge_pack_installs {
  id          Int      @id @default(autoincrement())
  packId      Int
  installedBy Int
  installedAt DateTime @default(now())
  pack        badge_packs @relation(fields: [packId], references: [id], onDelete: Cascade)

  @@unique([packId])                     // toggle global; vira [laboratoryId, packId] no 05
  @@index([packId])
}

// Alteracoes em `badges` (modelo existente, :327-340):
// + packId        Int?    @relation("BadgePackBadges")
// + criteriaVersion Int   @default(1)   // 1 = formato flat atual (intocado); 2 = arvore
```

- `badges.packId` e **nullable** e a relacao e **optional**: badge avulso legado
  (`packId = null`) permanece valido e continua aparecendo no catalogo.
- **`badges` nao e clonada** em install/uninstall (RF-04-EXT-05 regra 1) — e por isso
  `user_badges.badgeId` continua apontando para uma linha estavel.
- `badge_pack_installs` sem coluna de laboratorio **nesta versao**: `laboratories` nao
  existe (unico `labId` do schema esta em `kanban_boards:301` e nao e usado por nenhum
  codigo). O `05-multi-lab-saas` adiciona a coluna de escopo e o unique passa a ser
  `[laboratoryId, packId]` — sem mudar a semantica do toggle.
- Migracao versionada: `add_badge_packs_and_criteria_v2` (Etapa 8 do PLAN). **Sem
  `db push`** (gotcha do repo).
- `criteriaVersion` default `1` garante que **todo** badge existente continua no motor v1
  congelado por golden, sem backfill.

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
| GET | `/api/gamification/badge-packs` | **Novo**: catalogo de pacotes (`published`/`installed` por padrao; `?all=1` exige permissao) | leitura autenticada |
| GET | `/api/gamification/badge-packs/[key]` | **Novo**: detalhe do pacote + seus badges | leitura autenticada |
| POST | `/api/gamification/badge-packs` | **Novo**: criar/publicar pacote (key, nome, icone, tema, `modifiers`, `isPublished`) | `MANAGE_BADGE_PACKS` |
| PATCH | `/api/gamification/badge-packs/[key]` | **Novo**: editar metadados/`version`/`modifiers`/`isPublished` | `MANAGE_BADGE_PACKS` |
| POST | `/api/gamification/badge-packs/[key]/install` | **Novo**: instalar (toggle idempotente) | `MANAGE_BADGE_PACKS` |
| DELETE | `/api/gamification/badge-packs/[key]/install` | **Novo**: desinstalar (toggle; nao apaga badges nem `user_badges`) | `MANAGE_BADGE_PACKS` |
| PATCH | `/api/badges/[id]` | **Alterado**: aceita `criteriaVersion: 2` + arvore de condicoes; `version: 1` rejeita formato v2 (400) | `MANAGE_BADGE_PACKS` |

### 7.2 Eventos de dominio publicados/consumidos
| Evento | Publisher | Consumidor | Estado |
|---|---|---|---|
| `onTaskCompleted` (award task) | task-management (`gamification-task-progress.events`, composition root:43) | gamification (`awardFromTaskCompletion`) | Existente; passa a persistir xp |
| `WORK_SESSION_COMPLETED` (award sessao) | work-execution (`work-execution-events.publisher`, composition root:67) | gamification (`awardFromWorkSession`) | Existente; passa a persistir xp |
| `GAMIFICATION_AWARD` (`history`) | gamification gateway | storage interno (dedup) | Existente; mantido |
| Abertura de lootbox | gamification (use-case) | `lootbox_openings` | Novo — sem fila, sync |
| Avaliacao de badges automaticos | gamification (interno, pos-`applyAward`) | `user_badges` + `users.xp` | Novo — **rolling no mesmo request** do award, sem fila e sem cron (RF-04.09) |

Nenhum evento novo cruza modulo; abertura de lootbox e registro local (sem publicacao
externa). Auditoria funcional desta feature **nao** usa `audit_logs` nesta versao.

O disparo da avaliacao de badges **nao** cruza modulo: `work-execution` e `task-management`
ja injetam a **porta local** `GamificationAwardsPort` no composition root (DEC-21) — o
`+ evaluateBadges` entra como metodo **opcional** dessa mesma porta, sem novo import
cruzado e sem nova aresta em `dependency-cruiser` (G0 segue com allow-list vazia).

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

Testes novos desta revisao (RF-04.09 + pacotes):

```
- tests/unit/modules/gamification/badge-engine-wiring.test.ts    (AC-04-17)  <- motor ligado
- tests/unit/modules/gamification/badge-criteria-v2.test.ts      (AC-04-20)  <- arvore pura
- tests/unit/modules/gamification/badge-criteria-v1-compat.test.ts (AC-04-21) <- v1 intocado
- tests/unit/modules/gamification/pack-modifiers.test.ts         (AC-04-22)  <- modificadores puros
- tests/unit/modules/gamification/badge-packs.use-cases.test.ts  (AC-04-18/19) <- catalogo+install
- tests/unit/modules/gamification/badge-packs.route.test.ts       (AC-04-19)  <- thin adapters
- tests/unit/modules/gamification/pack-invariants.test.ts         (AC-04-23)  <- xp monotonico/historico
- tests/integration/badge-packs-roundtrip.test.ts                 (AC-04-18)  <- DB real, sem clone
- tests/unit/components/gamification/badge-pack-card.test.tsx     (AC-04-24)  <- UI do pacote
- tests/unit/components/gamification/criteria-tree-editor.test.tsx (AC-04-24) <- UI de criterios
```

> **Baseline do G3 (corrigido 2026-10-01).** As versoes anteriores desta SPEC citavam
> "256/257 com unico fail conhecido `floating-session-timer`". Esse numero vem de outra
> base: o arquivo `tests/unit/components/floating-session-timer.test.tsx` **nao existe**
> neste repo, e o gotcha correspondente esta em `AGENTS.md`. A baseline **verificada** aqui
> (pos-clean-arch, registrada em `displayquest-v2/clean-arch/STATE.json`) e
> **67 arquivos / 1245 testes, zero failure**. Use a do `ARCHITECTURE.md` §5 (G3).

Comandos (ordem dos gates do ARCHITECTURE), com `set -a; source .env; set +a`:

- G1 `npx eslint --no-eslintrc --config .eslintrc.json <arquivos alterados>` — exit 0
- G2 `npx tsc --noEmit` — 0 errors
- G3 `npx vitest run` — **67 arquivos / 1245 testes, zero failure** (baseline verificada;
  a contagem so cresce) + todos os novos verdes
- G4 `DATABASE_URL=postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test npx vitest run` — roundtrips no banco de teste **isolado** (nunca a 5432, que e o `display-quest-db` de producao local)
- G5 `npx prisma migrate dev` (local) — sem `db push`

Contagem esperada ao final: baseline 67/1245 + ~11 arquivos de teste novos.

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
| AC-04-17 | Given badge ativo com criterio satisfeito e nenhum award anterior; When um award de task ou work session e aplicado; Then `user_badges` recebe a badge e o `+BADGE_XP` **no mesmo request**; When a avaliacao de badges lanca erro; Then o award permanece aplicado (xp/points nao revertidos) e o erro fica registrado | `badge-engine-wiring.test.ts` (+ roundtrip) | RF-04.09 / §2.2 |
| AC-04-18 | Given pacote P publicado; When um curador instala P; Then `badges.count` e **identico** antes e depois (zero badges clonadas), `packId` preenchido em todas as badges de P, e `badge_pack_installs` tem exatamente 1 linha para P | `badge-packs-roundtrip.test.ts` + `badge-packs.use-cases.test.ts` | RF-04-EXT-04/05 |
| AC-04-19 | Given P instalado; When `POST .../install` repetido; Then idempotente (sem linha duplicada); When `DELETE .../install`; Then toggle desliga e **nao apaga** badges nem `user_badges`; Given badge avulso (`packId=null`); When install; Then 400 (nao e instalavel); When ator sem `MANAGE_BADGE_PACKS`; Then 403 | `badge-packs.route.test.ts` + `badge-packs.use-cases.test.ts` | RF-04-EXT-05 |
| AC-04-20 | Given criteria v2 com `all`/`any`/`not`; When avaliado; Then combina corretamente; When eixo ou comparador desconhecido; Then 400 na autoria e **nunca** `false` silencioso; When `specialCondition` com `op: is`; Then **igualdade** sobre enum (sem substring) | `badge-criteria-v2.test.ts` | RF-04-EXT-06 |
| AC-04-21 | Given badges preexistentes (todas com `criteriaVersion` ausente/`1`); When a feature entra; Then sao avaliadas pelo **motor v1 atual**, incluindo o quirk de threshold `0` ignorado — suites golden/gamification existentes seguem verdes sem edicao | `badge-criteria-v1-compat.test.ts` + `npx vitest run tests/unit/modules/gamification` | RF-04-EXT-06 / D-04-10 |
| AC-04-22 | Given pacote instalado com `SESSION_XP_MULTIPLIER_NIGHT: 1.5`; When uma sessao noturna rende 20 xp; Then concede 30; When a mesma sessao de dia; Then concede 20; Given multiplicador fora de `0.5..2.0` ou 3+ modificadores; Then rejeitado na autoria; Then **nunca** altera `users.points` | `pack-modifiers.test.ts` | RF-04-EXT-07 / D-04-01 |
| AC-04-23 | Given U com 3 badges de P e o XP correspondente; When P e desinstalado e reinstallado; Then `users.xp` nao reverte nem duplica, as 3 `user_badges` permanecem, e a reavaliacao nao volta a conceder; Given badges ja conquistados antes de uma mudanca de pacote; Then zero XP retroativo | `pack-invariants.test.ts` | RF-04-EXT-08 / D-04-07 |
| AC-04-24 | Given o mirror de permissao; Then o card de pacote e a arvore de criterios so renderizam com `MANAGE_BADGE_PACKS` (e a vitrine publica sem mirror), usando tokens/padrao de grid do `plan-v2/UI-UX.md`; nenhuma badge de pacote desinstalado aparece na vitrine | `badge-pack-card.test.tsx` + `criteria-tree-editor.test.tsx` | RF-04-EXT-04/06 / UI-UX §4 |
| AC-04-25 | Given todas as etapas (0..11) verdes; Then **G0**–G5 verdes com allow-list vazia, 3 migracoes versionadas sem `db push`, e `STATE.json` com `decisions[]` D-04-09..13 e evidencia de todas as ACs | checklist do PLAN §7 + `STATE.evidence` | processo geral |

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
- **Escopo por laboratorio dos pacotes** — `laboratories` nao existe; a instalacao e
  **global** nesta versao (RF-04-EXT-05 regra 6). O eixo por lab entra em
  `05-multi-lab-saas` como coluna de escopo em `badge_pack_installs`, sem mudar a
  semantica do toggle.
- **Avaliacao de badge por periodo** (semanal/mensal/"todo dia") — o motor e **rolling no
  award** (RF-04.09); criterios temporais (`withinDays`, `weekday`) sao avaliados no
  contexto do award, nao por agendamento.
- **Marketplace/curadoria externa de pacotes** — os pacotes sao autoria interna
  (`MANAGE_BADGE_PACKS`); import/export de lote via JSON e semente de deploy, nao upload
  por terceiro.
- **Modificador fora do enum fechado** e **empilhamento com regra aditiva livre** — apenas
  os nomeados em `pack-modifiers.ts`, limitado a 2 simultaneos.
- **Badge avulso obrigatorio dentro de pacote** — `packId` nullable por compatibilidade;
  exigir pacote para todo badge novo e regra de autoria da UI, nao de schema.
- **Arvore de criterios com profundidade arbitraria** — limite de 3 niveis (RF-04-EXT-06
  regra 6).

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
| `floating-session-timer` (fail conhecido) | teste legado | Nao bloqueador — ver nota de baseline no §8 |
| **Escopo por lab da instalacao de pacote** | decisao de negocio | Confirmar que o toggle **global** basta nesta versao e que o eixo por lab fica para o `05` (ver STATE `blockers[]`) |
| **Custo da re-avaliacao rolling** | decisao de projeto | Confirmar `evaluateUserBadges` em **todo** award (agrega stats por evento) vs. otimizar por eixo dependente (ver STATE `blockers[]`) |
| **Volume real do catalogo de badges** | dado de producao | 4 pacotes x 20 badges = 80 badges no catalogo ativo apos install; confirmar se a re-avaliacao completa (sem filtro por eixo) se sustenta no volume real |