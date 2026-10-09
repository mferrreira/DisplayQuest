-- G4 harness fixture (local test infra, tests/ is gitignored).
--
-- WHY: `prisma/seed.dev.ts` still writes pre-contract rows (tasks with
-- `in_progress`/`pending`/`completed`, purchases only `delivered`/`processing`).
-- tests/integration/entities-roundtrip.test.ts asserts the entity contracts
-- against REAL persisted rows, and encodes D-8: legacy purchase statuses MUST be
-- rejected while at least one current-domain status exists.
--
-- This script normalizes a freshly seeded DEV database to the state the current
-- backend actually produces (see backend/modules/store/infrastructure/
-- store-service.gateway.ts and the `tasks` status enum), while KEEPING one legacy
-- purchase row so the D-8 negative assertion still has data to reject.
--
-- Apply ONLY to an isolated test database. Never against the deployed instance.

UPDATE tasks
   SET status = CASE status
     WHEN 'in_progress' THEN 'in-progress'
     WHEN 'pending'     THEN 'to-do'
     WHEN 'completed'   THEN 'done'
     ELSE status
   END
 WHERE status IN ('in_progress', 'pending', 'completed');

-- One purchase moves to the current domain status ("approved"), the other stays
-- legacy ("delivered") on purpose: it is the row the schema must REJECT (D-8).
UPDATE purchases
   SET status = 'approved'
 WHERE id = (SELECT MIN(id) FROM purchases);

-- NOT touched on purpose: `issues` has its own lifecycle enum
-- (open -> in_progress -> resolved | closed, entities/issue.ts) and the seeded
-- rows are already contract-valid. Do not "normalize" them to hyphenated statuses.
