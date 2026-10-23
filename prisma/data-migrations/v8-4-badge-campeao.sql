-- plan-v8 V8-4 (DEC-213) — DATA MIGRATION do troféu CAMPEÃO.
--
-- NÃO é migration de schema: é um passo de dados, aplicado explicitamente. Na 5433 na V8-4 (para os
-- roundtrips G4 e a agenda da worktree encontrarem o troféu no catálogo); na 5432 real uma única vez,
-- no batch V8-CLOSE (DEC-221), depois do `migrate deploy` do schema.
--
-- O que faz: entra no catálogo o troféu vitalício concedido ao primeiro colocado da temporada — a
-- maior soma dos pontos MENSAIS do ano (MODELO §4), desempate tarefas → XP → userId.
--
-- `criteria` é NULO de propósito, e é a parte mais importante deste arquivo. O motor de avaliação de
-- hoje (`badgeCriteriaMet` em `backend/domain/gamification/badge-rules.ts`) corta em `!criteria` e
-- devolve falso — critério nulo não concede o troféu a ninguém. Um critério com `specialCondition`
-- nova ("season_champion") cairia no QUIRK-6C (condição desconhecida devolve VERDADEIRO) e concederia
-- o CAMPEÃO a toda pessoa na primeira avaliação disparada por conclusão de tarefa. Quem concede o
-- troféu é a rotina de fechamento de temporada, e só ela. O vocabulário de critério com janela
-- `temporada` chega na V8-6 (DEC-218/219), quando o motor for reescrito.
--
-- Idempotente por construção: a cláusula NOT EXISTS olha o nome. Rodar duas vezes não duplica, e a
-- unique de `user_badges (userId, badgeId)` continua garantindo que a conquista é vitalícia — quem é
-- campeão em dois anos tem um troféu e duas linhas de decisão na auditoria.
--
-- `createdBy` é a FK do catálogo. Escolhe o primeiro COORDENADOR por id; sem coordenador, a pessoa de
-- menor id. O campo é auditoria de quem criou o troféu, não autoridade: a concessão não lê createdBy.

INSERT INTO "badges" ("name", "description", "icon", "color", "category", "criteria", "isActive", "createdBy")
SELECT
  'CAMPEÃO',
  'Concedido automaticamente na virada de temporada a quem somou mais pontos mensais no ano. Vitalício: não reseta, e entra nos slots de troféu do elo.',
  'trophy',
  '#f59e0b',
  'special',
  NULL,
  TRUE,
  COALESCE(
    (SELECT "id" FROM "users" WHERE 'COORDENADOR'::"UserRole" = ANY("roles") ORDER BY "id" ASC LIMIT 1),
    (SELECT MIN("id") FROM "users")
  )
WHERE NOT EXISTS (
  SELECT 1 FROM "badges" WHERE "name" = 'CAMPEÃO'
)
  AND COALESCE(
    (SELECT "id" FROM "users" WHERE 'COORDENADOR'::"UserRole" = ANY("roles") ORDER BY "id" ASC LIMIT 1),
    (SELECT MIN("id") FROM "users")
  ) IS NOT NULL;
