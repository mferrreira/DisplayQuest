-- V5-4b (DEC-69/140/149): dados do vínculo usuário×projeto.
-- Derivado offline com `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ...
-- --script` e aplicado com `migrate deploy` na 5432 e na 5433. Nunca `migrate dev`: a 5432 tem os
-- dados reais do dono e a deriva pede RESET.
--
-- `situacao` é a única coluna NOT NULL: ela nasce com situação (ATIVO), não fica sem dela.
-- Sem CHECK: as listas fechadas (categoria, situacao) vivem na validação do domínio, mesma
-- postura da DEC-141.

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "cargaHoraria" DOUBLE PRECISION,
ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "dataEntrada" TEXT,
ADD COLUMN     "lattes" TEXT,
ADD COLUMN     "situacao" TEXT NOT NULL DEFAULT 'ATIVO';
