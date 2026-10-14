-- V5-8 (DEC-64): notificação prioritária para atraso de atividade.
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "priority" BOOLEAN NOT NULL DEFAULT false;
