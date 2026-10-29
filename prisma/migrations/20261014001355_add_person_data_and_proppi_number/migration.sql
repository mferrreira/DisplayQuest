-- V5-4a (DEC-138/DEC-140): dados de pessoa em `users` e nº PROPPI em `projects`.
-- Derivada offline (`prisma migrate diff --from-schema-datamodel ... --script`), aplicada com
-- `prisma migrate deploy` na 5432 e na 5433. Tudo nullable: nenhuma linha existente muda.
-- Os vocabulários fechados (modalidade, fomento, nível) são regra de escrita no domínio
-- (backend/domain/identity/person-data-rules.ts), não constraint no banco — o mesmo desenho
-- de `tasks.status` e das datas civis.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "course" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "fundingAgency" TEXT,
ADD COLUMN     "fundingAgencyOther" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "scholarshipType" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "proppiNumber" TEXT;
