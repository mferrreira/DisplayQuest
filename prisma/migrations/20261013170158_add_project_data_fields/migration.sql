-- V5-2b (DEC-61/63): dados do projeto. Tudo nullable ou com default — nenhuma linha
-- existente é tocada, nenhum backfill (protocolo do V4-4: diff offline + migrate deploy).
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "editalNumber" TEXT,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processNumber" TEXT,
ADD COLUMN     "startDate" TEXT;
