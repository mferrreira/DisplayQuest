-- CreateTable
CREATE TABLE "task_subtasks" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_subtasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_subtasks_taskId_idx" ON "task_subtasks"("taskId");

-- CreateIndex
CREATE INDEX "task_subtasks_taskId_completed_idx" ON "task_subtasks"("taskId", "completed");

-- AddForeignKey
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

