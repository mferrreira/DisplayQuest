-- DEC-242: chave do objeto do avatar no bucket (users/<id>/images/avatar), mesma forma da capa.
-- Só ALTER TABLE ADD COLUMN nullable — nenhuma linha existente é tocada.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarKey" TEXT;
