-- plan-v8 V8-6 (DEC-217): o elo da temporada passa a ser coluna.
--
-- Derivado do XP da temporada pela escada do dominio (backend/domain/gamification/elo-rules.ts),
-- com default BRONZE: o degrau de quem comeca a temporada e o de quem volta na virada (MODELO §4).
-- String com default como `status` e `history.track` — a mesma escolha da DEC-141 para vocabulario:
-- o banco aceita qualquer texto e a fechadura e o guarda de teste, nao uma constraint.
--
-- Delta medido offline (mesmo caminho do V4-4): `prisma migrate diff --from-schema-datamodel
-- <antes> --to-schema-datamodel <novo> --script`, gravado aqui e aplicado com `migrate deploy`.
-- Na 5433 nesta onda; na 5432 real apenas no batch V8-CLOSE (DEC-221).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "elo" TEXT NOT NULL DEFAULT 'BRONZE';
