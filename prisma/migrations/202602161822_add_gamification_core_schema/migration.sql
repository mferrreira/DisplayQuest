CREATE TABLE IF NOT EXISTS "gamification_profiles" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "displayName" TEXT,
  "archetype" TEXT,
  "title" TEXT,
  "bioRpg" TEXT,
  "lore" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "xpTotal" INTEGER NOT NULL DEFAULT 0,
  "elo" TEXT NOT NULL DEFAULT 'MADEIRA_II',
  "trophies" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "gamification_wallets" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "coins" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "gamification_inventory_items" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "itemKey" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "rarity" TEXT NOT NULL DEFAULT 'common',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "metadata" JSONB,
  "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceType" TEXT,
  "sourceRefId" TEXT,
  CONSTRAINT "gamification_inventory_items_user_item_unique" UNIQUE ("userId", "itemKey")
);
CREATE INDEX IF NOT EXISTS "gamification_inventory_items_user_rarity_idx" ON "gamification_inventory_items"("userId", "rarity");

CREATE TABLE IF NOT EXISTS "gamification_quest_definitions" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "questType" TEXT NOT NULL DEFAULT 'DAILY',
  "scope" TEXT NOT NULL DEFAULT 'PROJECT',
  "minElo" TEXT,
  "minLevel" INTEGER,
  "visibilityRule" JSONB,
  "requirements" JSONB,
  "rewards" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "gamification_quest_progress" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "questId" INTEGER NOT NULL REFERENCES "gamification_quest_definitions"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "progressValue" INTEGER NOT NULL DEFAULT 0,
  "targetValue" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "gamification_quest_progress_user_quest_unique" UNIQUE ("userId", "questId")
);
CREATE INDEX IF NOT EXISTS "gamification_quest_progress_user_status_idx" ON "gamification_quest_progress"("userId", "status");

CREATE TABLE IF NOT EXISTS "gamification_story_arcs" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "chapter" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "gamification_story_progress" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "storyArcId" INTEGER NOT NULL REFERENCES "gamification_story_arcs"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'LOCKED',
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "completedSteps" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "gamification_story_progress_user_arc_unique" UNIQUE ("userId", "storyArcId")
);
CREATE INDEX IF NOT EXISTS "gamification_story_progress_user_status_idx" ON "gamification_story_progress"("userId", "status");

INSERT INTO "gamification_profiles" ("userId")
SELECT u."id" FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "gamification_profiles" gp WHERE gp."userId" = u."id"
);

INSERT INTO "gamification_wallets" ("userId")
SELECT u."id" FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "gamification_wallets" gw WHERE gw."userId" = u."id"
);
