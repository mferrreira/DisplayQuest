-- AlterTable
ALTER TABLE "lab_responsibilities" ADD COLUMN     "pausedAt" TEXT,
ADD COLUMN     "totalPausedMs" INTEGER NOT NULL DEFAULT 0;
