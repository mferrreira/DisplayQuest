-- D-1 (DEC-141, fecha GAP-05 do clean-arch): os status pré-contrato que `tasks.status` aceitou
-- enquanto a coluna era TEXT sem constraint. Os três valores são os medidos em 2026-10-01 (14 de
-- 18 linhas na 5432) e os mesmos que `entities/task.ts` absorvia em tempo de leitura.
--
-- Sem constraint na coluna, por decisão: a lista fechada vive na validação, não no banco.
-- Idempotente por construção — onde não há valor legado, não reescreve linha nenhuma (medido na
-- 5432 em 2026-10-13: 36 tarefas, todas `done`, zero linhas reescritas).

UPDATE "tasks" SET "status" = 'to-do'       WHERE "status" = 'pending';
UPDATE "tasks" SET "status" = 'in-progress' WHERE "status" = 'in_progress';
UPDATE "tasks" SET "status" = 'done'        WHERE "status" = 'completed';
