-- S05 (plan-v21, DEC-260) — cumprimento de meta pela gestão. `completedBy` é SetNull (espelho
-- `approvedBy` do cronograma, DEC-155): a meta é dado do projeto, e a saída de uma pessoa não
-- apaga a meta nem o seu cumprimento.

-- AlterTable
ALTER TABLE "project_goals" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedBy" INTEGER;

-- CreateIndex
CREATE INDEX "project_goals_completedBy_idx" ON "project_goals"("completedBy");

-- AddForeignKey
ALTER TABLE "project_goals" ADD CONSTRAINT "project_goals_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
