-- DEC-233: preserve the first start separately from the active stretch start.
-- Existing rows are intentionally left NULL; a resumed row has no recoverable first start.
ALTER TABLE "work_sessions" ADD COLUMN "originalStartTime" TIMESTAMP(3);
