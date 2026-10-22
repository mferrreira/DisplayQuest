-- plan-v8 V8-1 (DEC-211, DEC-215, DEC-216, DEC-219): as trilhas novas no schema.
--
-- Derivado OFFLINE pelo caminho medido no V4-4 (nunca `migrate dev`, que pode pedir RESET):
--   prisma migrate diff --from-schema-datamodel <schema de antes> \
--     --to-schema-datamodel prisma/schema.prisma --script
--
-- O que entra:
--   users.coins / users.xp        — moeda vitalícia (loja) e XP da temporada anual.
--   month_history                 — snapshot mensal do placar, idempotência (userId, month).
--   season_history                — livro-caixa da temporada, idempotência (userId, year).
--   history.track                 — de qual trilha fala a linha (POINTS | COINS | XP, default POINTS).
--   badges.effects                — lista fechada de {verb, tier} (DEC-218; validada na V8-6).
--   user_badges.equipped          — conquistado (vitalício) x equipado (slot do elo do momento).
--
-- O que sai: projects.points (DEC-215) — o saldo Hamilton do projeto deixa de ser trilha do
-- sistema; o prêmio de atividade aprovada passa a ser moeda da pessoa (V8-5) e o publicador
-- TaskCompletedEvent -> projects.points (DEC-63) saiu junto.
--
-- A virada 1:1 dos dados (users.coins = users.points, placar mensal começa em 0) NÃO é deste
-- arquivo: é a data migration `prisma/data-migrations/v8-1-virada-1-1.sql`, aplicada na 5433 na
-- V8-1 e na 5432 real no batch V8-CLOSE (DEC-221).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "points";

-- AlterTable
ALTER TABLE "history" ADD COLUMN     "track" TEXT NOT NULL DEFAULT 'POINTS';

-- AlterTable
ALTER TABLE "badges" ADD COLUMN     "effects" JSONB;

-- AlterTable
ALTER TABLE "user_badges" ADD COLUMN     "equipped" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "month_history" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "month_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_history" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "elo" TEXT,
    "position" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "month_history_month_idx" ON "month_history"("month");

-- CreateIndex
CREATE UNIQUE INDEX "month_history_userId_month_key" ON "month_history"("userId", "month");

-- CreateIndex
CREATE INDEX "season_history_year_idx" ON "season_history"("year");

-- CreateIndex
CREATE UNIQUE INDEX "season_history_userId_year_key" ON "season_history"("userId", "year");

-- AddForeignKey
ALTER TABLE "month_history" ADD CONSTRAINT "month_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_history" ADD CONSTRAINT "season_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

