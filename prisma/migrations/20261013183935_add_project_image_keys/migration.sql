-- V5-2d (DEC-102): chave do objeto no bucket para logo e banner do projeto.
-- Só ALTER TABLE ADD COLUMN nullable — nenhuma linha existente é tocada.
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "bannerKey" TEXT,
ADD COLUMN     "logoKey" TEXT;

