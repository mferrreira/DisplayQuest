-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "createdBy" INTEGER;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
