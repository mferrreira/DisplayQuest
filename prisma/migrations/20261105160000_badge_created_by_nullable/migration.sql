-- plan-v15 S09 (R5): o catálogo SQL (prisma/cataloga-badges.sql) é idempotente por slug e
-- pode ser aplicado numa base onde ainda não existe usuário (deploy, 5433 antes do seed),
-- então a autoria de badge de catálogo passa a ser nula. A FK badges.createdBy continua
-- RESTRICT: excluir usuário segue bloqueada por badge criado por ele (DEC-55).
ALTER TABLE "badges" ALTER COLUMN "createdBy" DROP NOT NULL;
