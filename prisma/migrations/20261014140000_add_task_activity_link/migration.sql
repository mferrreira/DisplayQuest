-- V5-6 (DEC-99): a tarefa passa a poder pertencer a uma linha do cronograma do projeto.
-- `SET NULL`, não o default `Restrict`: apagar uma etapa do cronograma não apaga tarefa
-- nenhuma (DEC-156), e a tarefa sobrevive sem vínculo. A checagem de "atividade do mesmo
-- projeto" é do use case, não da FK: a FK não sabe qual projeto a tarefa declara ter.
-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "activityId" INTEGER;

-- CreateIndex
CREATE INDEX "tasks_activityId_idx" ON "tasks"("activityId");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "project_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
