-- plan-v9 (ADR-001, DEC-224): placar do mes em curso, a trilha que o Quadro de Lideranca ordena.
--
-- O backfill e deliberado (MODELO.md §6): numa base que ja tem saldos, o placar comeca com o valor
-- atual de `points`, para ninguem acordar com o quadro zerado por causa da implantacao. Sem isso,
-- o primeiro mes depois do deploy mostraria todo mundo em zero e o fechamento nao teria o que
-- registrar. Na instancia de hoje (medido 2026-10-26: 6 usuarios, todos com pontos 0, nenhuma linha
-- de premio) o UPDATE nao muda nada.
ALTER TABLE "users" ADD COLUMN     "currentMonthPoints" INTEGER NOT NULL DEFAULT 0;

UPDATE "users" SET "currentMonthPoints" = "points";
