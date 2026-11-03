-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bannerCropX" DOUBLE PRECISION,
ADD COLUMN     "bannerCropY" DOUBLE PRECISION,
ADD COLUMN     "bannerCropZoom" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "bannerCropX" DOUBLE PRECISION,
ADD COLUMN     "bannerCropY" DOUBLE PRECISION,
ADD COLUMN     "bannerCropZoom" DOUBLE PRECISION;
