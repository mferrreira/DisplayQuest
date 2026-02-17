# Gamification Blueprint (V1 -> V3)

## 1) Objetivo
Transformar o sistema em uma plataforma de gestao + RPG sem comprometer seguranca e manutenibilidade.

Principio central:
- `RBAC` continua dono das permissoes criticas (admin/coordenacao).
- `Gamification` controla progressao (XP, nivel, elo, quests, trofeus).
- `Store` controla economia e inventario (moedas, baus, itens).

---

## 2) Bounded Contexts

### 2.1 Identity Access (existente)
Responsavel por:
- autenticacao
- autorizacao de seguranca (`MANAGE_USERS`, `DASHBOARD_ADMIN`, etc)

Regra:
- elo nao concede acesso critico de administracao.
- elo so pode conceder permissoes de gameplay (ex: quests cross-project de baixa prioridade).

### 2.2 Gamification (core de progressao)
Responsavel por:
- XP
- nivel
- elo
- trofeus/badges de progresso
- quests (nao tasks)
- multiplicadores e bonus

### 2.3 Store (economia)
Responsavel por:
- wallet (moedas)
- catalogo de itens/baus
- compra de bau/item
- abertura de bau e distribuicao de drop
- inventario do usuario

---

## 3) Modelo Conceitual (Dominio)

## 3.1 Progression

### Entidades
- `ProgressProfile`
  - `userId`
  - `xpTotal`
  - `level`
  - `elo` (ex: MADEIRA_II, MADEIRA_I, FERRO_III ... CHALLENGER)
  - `trophies`
  - `updatedAt`

- `EloRule`
  - `elo`
  - `minLevel`
  - `minTrophies`
  - `xpMultiplier`
  - `coinMultiplier`
  - `unlockedCapabilities[]`

- `LevelRule`
  - `level`
  - `xpRequiredTotal`
  - `rewards` (ex: `+5000 coins`, `+800 xp`, item, bau)

### Value Objects
- `XpGrant`
  - `base`
  - `multiplier`
  - `final`
  - `reason`

- `CoinGrant`
  - `base`
  - `multiplier`
  - `final`
  - `reason`

## 3.2 Quests

### Entidades
- `QuestDefinition`
  - `id`
  - `title`
  - `description`
  - `type` (`DAILY`, `WEEKLY`, `EVENT`, `STORY`)
  - `scope` (`PROJECT`, `GLOBAL`, `CROSS_PROJECT`)
  - `requirements` (json de regras)
  - `rewards` (xp, moedas, bau, item, trofeu)
  - `visibilityRule` (elo minimo, roles permitidas, etc)
  - `active`

- `QuestProgress`
  - `userId`
  - `questId`
  - `progress`
  - `target`
  - `status` (`IN_PROGRESS`, `COMPLETED`, `CLAIMED`, `EXPIRED`)
  - `startedAt`
  - `completedAt`

## 3.3 Trophies / Badges

### Entidades
- `AchievementDefinition`
  - `id`
  - `name`
  - `criteria` (horas, tasks, quests, streak, nivel, elo)
  - `reward` (optional)

- `UserAchievement`
  - `userId`
  - `achievementId`
  - `earnedAt`

## 3.4 Economy + Store

### Entidades
- `Wallet`
  - `userId`
  - `coins`
  - `updatedAt`

- `ChestDefinition`
  - `id`
  - `name`
  - `priceCoins`
  - `dropTableId`
  - `rarity`
  - `active`

- `DropTable`
  - `id`
  - `entries[]` (item, chance, qtyMin, qtyMax)

- `InventoryItem`
  - `userId`
  - `itemId`
  - `quantity`

- `EconomyLedgerEntry`
  - `idempotencyKey`
  - `userId`
  - `type` (`EARN`, `SPEND`, `REFUND`)
  - `currency` (`COINS`, futuro `GEMS`)
  - `amount`
  - `reason`
  - `sourceEvent`
  - `createdAt`

---

## 4) Eventos de Dominio (Event-Driven)

Eventos de entrada (de outros modulos):
- `TaskCompleted`
- `TaskApproved`
- `WorkSessionCompleted`
- `QuestCompleted` (interno)
- `WeeklyGoalReached` (opcional)

Eventos de saida (gamification/store):
- `XpGranted`
- `CoinsGranted`
- `LevelUp`
- `EloPromoted`
- `AchievementUnlocked`
- `ChestPurchased`
- `ChestOpened`
- `ItemGranted`

Regra tecnica:
- cada processamento usa `idempotencyKey` por evento para nao duplicar recompensa.

---

## 5) Contratos entre Modulos

## 5.1 Task Management -> Gamification
- `onTaskCompleted(userId, taskId, pointsBase, projectId, completedAt)`
- `onTaskApproved(userId, taskId, approvedAt)`

## 5.2 Work Execution -> Gamification
- `onWorkSessionCompleted(userId, sessionId, durationSeconds, completedAt, projectId, taskIds[])`

## 5.3 Gamification -> Store
- `grantCoins(userId, amount, reason, idempotencyKey)`
- `grantChest(userId, chestId, reason, idempotencyKey)`

## 5.4 Gamification -> Notifications
- disparos de:
  - level up
  - elo up
  - quest concluida
  - achievement desbloqueado

---

## 6) Regras de Progressao (inicial, configuravel)

## 6.1 XP base
- task concluida: `xpTaskBase`
- quest concluida: `xpQuestBase`
- bonus por hora de work session: `xpPerHourBase`

Formula:
- `xpFinal = floor((xpTaskBase + xpQuestBase + xpHourBase) * eloXpMultiplier * eventMultiplier)`

## 6.2 Moedas base
- task concluida: `coinTaskBase`
- quest concluida: `coinQuestBase`
- bonus por marcos (1h sessao, 3 tasks, streak)

Formula:
- `coinsFinal = floor((coinTaskBase + coinQuestBase + bonuses) * eloCoinMultiplier)`

## 6.3 Promocao de Elo
- se `level >= minLevel` e `trophies >= minTrophies`, promove para proximo elo.

Exemplo:
- MADEIRA_II -> FERRO_III quando `level >= 10` e `trophies >= 2`.

## 6.4 Capabilities por Elo (somente gameplay)
- FERRO+: mais xp por task
- BRONZE+: mais moedas e bonus por 1h + 3 tasks
- PRATA/GOLD+: visualizar quests low-priority cross-project
- CHALLENGER: bonus maximos e quests especiais

---

## 7) Configuracao (sem hardcode)

Criar tabela/config para:
- `progression_level_rules`
- `progression_elo_rules`
- `gamification_reward_rules`
- `quest_definitions`
- `quest_reward_rules`
- `store_chest_drop_tables`

Com isso:
- coordenacao consegue ajustar balanceamento sem redeploy.

---

## 8) Banco (proposta minima)

Novas tabelas:
- `gamification_profiles`
- `gamification_level_rules`
- `gamification_elo_rules`
- `gamification_xp_ledger`
- `gamification_achievement_defs`
- `gamification_user_achievements`
- `gamification_quest_defs`
- `gamification_quest_progress`
- `wallets`
- `economy_ledger`
- `store_items`
- `store_chests`
- `store_drop_tables`
- `inventories`

Campo novo ja adicionado:
- `tasks.completedAt`

---

## 9) Use Cases (Application Layer)

Gamification:
- `awardFromTaskCompletion`
- `awardFromWorkSession`
- `claimQuestReward`
- `evaluateEloPromotion`
- `getUserProgression`
- `listAvailableQuestsForUser`

Store:
- `purchaseChest`
- `openChest`
- `purchaseItem`
- `listStoreCatalog`
- `getInventoryByUser`

---

## 10) Integracao Frontend (alvo)

Painel usuario:
- card de progressao (elo, nivel, xp atual/proximo nivel)
- saldo de moedas
- quests ativas (diarias/semanais)
- historico de recompensas

Painel admin/coordenacao:
- editor de regras de XP/Nivel/Elo
- editor de quests
- editor de baus/drop table
- simulador de progressao (preview de balanceamento)

---

## 11) Seguranca e Governanca

- nenhuma permissao critica de RBAC deve depender de elo.
- rewards so por backend/eventos assinados.
- idempotencia obrigatoria para ledger.
- auditoria em `xp_ledger` e `economy_ledger`.

---

## 12) Roadmap de Implementacao

## Fase 1 (MVP util)
1. `ProgressProfile` + `XP/Nivel/Elo` com regras fixas em tabela.
2. `Wallet` + moedas por task/work session.
3. `XP ledger` + `Economy ledger`.
4. endpoints:
   - `GET /api/gamification/me/progression`
   - `GET /api/gamification/me/wallet`

## Fase 2 (Quests e loja funcional)
1. quest definitions + progress por evento.
2. compra e abertura de bau.
3. inventario de itens.
4. painel admin para gerenciar quest/reward/drop.

## Fase 3 (RolePlay/Narrativa)
1. `story arcs`
2. quests encadeadas por capitulo
3. eventos sazonais
4. recompensas narrativas exclusivas

---

## 13) Riscos e Mitigacoes

Riscos:
- inflacao de moedas/xp
- regras espalhadas no front
- fraude por chamadas diretas de reward

Mitigacoes:
- ledger + idempotencia + eventos backend
- regras centralizadas no dominio gamification
- flags de balanceamento por ambiente

---

## 14) Decisoes de Arquitetura

- manter monolito Next + modulos backend (atual), sem extrair microservico agora.
- adotar modelo event-driven interno com publishers/handlers por modulo.
- manter `tasks` e `quests` separados:
  - task = gestao de trabalho
  - quest = objetivo de gamificacao

---

## 15) Status Atual (2026-02-17)

Implementado hoje:
- Story Arcs com:
  - passos encadeados por requisito
  - recompensas por passo (xp, coins, trofeus, item)
  - dependencias entre arcos (`dependsOnArcCodes`)
  - janela sazonal por datas (`startsAt`/`endsAt`)
  - motivo de bloqueio + proximo objetivo na API/UI
- Sincronizacao automatica de Story Arcs apos eventos de progressao:
  - task concluida
  - work session concluida
  - claim de quest
  - abertura de bau
- Admin Gamification:
  - CRUD de Story Arcs
  - configuracao de dependencia e sazonalidade
- Loja:
  - dialog de resultado ao abrir bau com lista de drops
  - exibicao de preco base vs preco final (desconto por classe)
- Perfil gamificado:
  - painel de atributos do heroi baseado em classe
  - leitura de bonus por points/xp/trofeus/coins
- Engine backend de classe (arquetipo):
  - multiplicador real de XP/coins/points em task/work session
  - modificador real de reward de quest
  - desconto real de bau + chance de drop extra

Validacao tecnica:
- `npx tsc --noEmit --pretty false` OK
- smoke runtime da gamificacao via modulo (`SMOKE_OK`)

Pendencia nao bloqueante:
- `npm run lint` ainda exige setup interativo do ESLint no projeto.
