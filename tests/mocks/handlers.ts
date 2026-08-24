/**
 * MSW request handlers.
 *
 * RULE (constitution §1 / EXECUTION-PLAN R4): every handler shape MUST be derived from the
 * real backend route/gateway source — never invented. Contract tests assert handler payloads
 * against entities/ Zod schemas so mocks cannot drift into fiction.
 *
 * Per-domain handlers are added in their epic (E2 tasks first) and registered here.
 */
import { http } from "msw";

export const handlers = [
  // Populated per-epic. Example shape:
  // http.get("*/api/health", () => HttpResponse.json({ status: "ok" })),
];
