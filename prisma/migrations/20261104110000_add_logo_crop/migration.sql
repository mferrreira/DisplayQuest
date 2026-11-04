-- DEC-242: recorte quadrado do avatar/logo. O avatar ganha chave no bucket, mesma forma da capa.
-- DEC-239: os tres parametros do recorte de capa seguem a mesma forma.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "logoCropX" DOUBLE PRECISION,
ADD COLUMN     "logoCropY" DOUBLE PRECISION,
ADD COLUMN     "logoCropZoom" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "logoCropX" DOUBLE PRECISION,
ADD COLUMN     "logoCropY" DOUBLE PRECISION,
ADD COLUMN     "logoCropZoom" DOUBLE PRECISION;
