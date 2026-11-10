-- S04 (plan-v21, DEC-259) — entregável sabe a que meta pertence. `goalId` é nullable com
-- SET NULL: meta é plano do projeto, entregável é o que se entrega — apagar a meta não pode
-- levar a linha do entregável junto, e o vínculo fica nulo (o entregável sobrevive sem meta).

-- AlterTable
ALTER TABLE "project_deliverables" ADD COLUMN     "goalId" INTEGER;

-- CreateIndex
CREATE INDEX "project_deliverables_goalId_idx" ON "project_deliverables"("goalId");

-- AddForeignKey
ALTER TABLE "project_deliverables" ADD CONSTRAINT "project_deliverables_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "project_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
