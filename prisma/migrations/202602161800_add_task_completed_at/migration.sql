ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

UPDATE "tasks"
SET "completedAt" = NOW()
WHERE "completed" = true
  AND "completedAt" IS NULL;
