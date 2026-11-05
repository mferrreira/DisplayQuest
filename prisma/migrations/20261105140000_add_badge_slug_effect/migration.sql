-- plan-v15 S04 (R8): passiva do badge. `slug` único alimenta o catálogo idempotente do
-- S09; `effect` guarda {kind:"bonus",pct} ou {kind:"penaltyReduction",pct}. Aditivo,
-- nullable, sem backfill — os badges existentes ficam sem passiva.
ALTER TABLE "badges" ADD COLUMN     "effect" JSONB,
ADD COLUMN     "slug" TEXT;

CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");
