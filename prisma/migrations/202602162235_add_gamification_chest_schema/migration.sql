CREATE TABLE IF NOT EXISTS "gamification_chest_definitions" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "priceCoins" INTEGER NOT NULL DEFAULT 100,
  "minDrops" INTEGER NOT NULL DEFAULT 1,
  "maxDrops" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "gamification_chest_drop_entries" (
  "id" SERIAL PRIMARY KEY,
  "chestId" TEXT NOT NULL REFERENCES "gamification_chest_definitions"("id") ON DELETE CASCADE,
  "itemKey" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "weight" INTEGER NOT NULL DEFAULT 1,
  "qtyMin" INTEGER NOT NULL DEFAULT 1,
  "qtyMax" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gamification_chest_drop_entries_chest_item_unique" UNIQUE ("chestId", "itemKey")
);

CREATE INDEX IF NOT EXISTS "gamification_chest_drop_entries_chest_active_idx" ON "gamification_chest_drop_entries"("chestId", "active");
