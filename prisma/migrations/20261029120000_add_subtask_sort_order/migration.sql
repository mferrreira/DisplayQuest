-- S09 (plan-v11, R9): ordem própria das subtasks, persistida.
ALTER TABLE "task_subtasks" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Ordem inicial = ordem de criação: as linhas existentes recebem a posição do próprio id.
UPDATE "task_subtasks" SET "sortOrder" = "id";
