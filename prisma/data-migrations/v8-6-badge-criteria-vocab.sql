-- plan-v8 V8-6 (DEC-219) — data migration do vocabulário de critério dos troféus.
--
-- O motor reescrito passou a conhecer um vocabulário fechado de métricas por janela
-- (`TROPHY_CRITERION_FIELDS` em `backend/domain/gamification/badge-rules.ts`). Uma chave que não
-- está nele não é "ignorada": é "esta janela não mede isto", e o troféu não é concedido — é o
-- conserto do QUIRK-6C (condição desconhecida deixava de tratar-se como verdadeira) aplicado ao
-- critério gravado.
--
-- A chave legada `minHours` nunca existiu no vocabulário do sistema: a métrica de horas por semana
-- que o motor sempre mediu é `weeklyHours` (a média das quatro semanas mais novas de
-- `weekly_hours_history`, congelada como golden desde OND6-B1). A reescrita mantém o valor e troca
-- a chave — "10 horas na semana" passa a significar "média semanal de 10 horas", que é o que o
-- sistema é capaz de medir.
--
-- MEDIDO na 5432 real (2026-10-23, leitura): o catálogo tem DUAS linhas e as duas são
-- `{"minHours": 10}` — id 1 "Mentor da Semana", id 2 "Guardião do Laboratório", sem `window`. Na
-- 5433 as duas equivalentes (ids 10 e 11) já tinham `window: "vida"` da data migration da V8-1.
-- Nenhuma linha tem `specialCondition` nem outra chave; ainda assim a escrita abaixo é por EDIÇÃO
-- (`criteria - 'minHours' || …`), não por reconstrução do objeto: reconstruir apagaria uma chave
-- que a migration não conhece, e apagar dado de troféu não é efeito colateral aceitável.
--
-- Idempotente por construção: depois da primeira run nenhuma linha tem `minHours`, e a cláusula
-- `WHERE criteria ? 'minHours'` não alcança nada.
--
-- Roda na 5433 no batch da onda e na 5432 real apenas no batch V8-CLOSE, junto da virada 1:1 (V8-1)
-- e da migration do CAMPEÃO (V8-4). Regime DEC-221.

UPDATE badges
SET criteria = (criteria - 'minHours') || jsonb_build_object(
  'window', COALESCE(criteria ->> 'window', 'vida'),
  'weeklyHours', (criteria -> 'minHours')::numeric
)
WHERE criteria ? 'minHours';
