-- plan-v8 V8-1 (DEC-216) — DATA MIGRATION da virada 1:1.
--
-- NÃO é uma migration de schema: é um passo de dados, aplicado explicitamente. Na 5433 na V8-1
-- (para que os roundtrips G4 e o e2e da worktree vejam o estado pós-virada); na 5432 real uma
-- única vez, no batch V8-CLOSE (DEC-221), depois do `migrate deploy` do schema.
--
-- O que faz: o saldo atual de pontos vira saldo de moeda 1:1 e o placar mensal começa em 0
-- (rodada 2 do dono). `rewards.price` mantém os números — passa a ser preço em moeda sem
-- aritmética nova (DEC-215). Compras pendentes e estornos seguem a trilha moeda (V8-5).
--
-- Herda a inflação antiga por decisão do dono (PLAN §7: redutor de inflação está fora do
-- escopo, corrigível depois com dados).
--
-- É idempotente por construção: depois da primeira aplicação, `points` já é 0 e a segunda
-- aplicação não move nada (`coins = coins + 0`). Ainda assim, rodar duas vezes na 5432 não é
-- ignorar o risco: o batch V8-CLOSE aplica uma vez e confere as somas antes e depois.
--
-- O critério do CAMPEÃO da temporada (DEC-213) é a soma dos pontos MENSAIS, e o saldo antigo é
-- vitalício — convertê-lo em placar de um mês inventaria uma liderança que ninguém ganhou. Daí
-- o placar começar em 0.

-- 1. moeda = saldo atual de pontos (trilha vitalícia).
UPDATE "users"
   SET "coins" = "coins" + "points";

-- 2. placar mensal começa limpo.
UPDATE "users"
   SET "points" = 0;

-- 3. catálogo de troféus: cada critério ganha janela `vida` (DEC-219 — "catálogo existente
--    migrado com janela vida"). Só quem tem critérioObjeto; critério nulo fica como está.
UPDATE "badges"
   SET "criteria" = "criteria" || '{"window":"vida"}'
 WHERE "criteria" IS NOT NULL
   AND jsonb_typeof("criteria") = 'object'
   AND NOT ("criteria" ? 'window');
