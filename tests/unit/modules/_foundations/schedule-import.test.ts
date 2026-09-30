// @vitest-environment node
/**
 * ONDA 0 / batch 0.5 — DC2: `lib/work-sessions/schedule.ts` still answers, but the code is in
 * the domain now (SPEC §4.5 AC-00-12, DEC-03).
 *
 * "Verificavel por teste de import": the export SETS must be equal and the FUNCTIONS must be
 * the very same objects. Two copies of the schedule maths would pass any behaviour test while
 * letting the two files drift apart — identity is the assertion that actually prevents that.
 */
import { describe, expect, it } from "vitest";
import * as domainSchedule from "@/backend/domain/work/schedule";
import * as legacySchedule from "@/lib/work-sessions/schedule";
import * as barrelSchedule from "@/backend/domain/work";

const EXPECTED_EXPORTS = [
  "getLastElapsedScheduledPause",
  "getMinutesUntilNextPause",
  "getMissedScheduledPause",
  "getNextScheduledPause",
  "MAX_STRETCH_SEC",
  "SCHEDULED_PAUSE_TIMES",
  "SESSION_TIMEZONE",
  "toSafeDate",
];

describe("schedule moved to backend/domain/work (AC-00-12)", () => {
  it("the domain module exports exactly the documented set", () => {
    expect(Object.keys(domainSchedule).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("the legacy lib path exports exactly the same set", () => {
    expect(Object.keys(legacySchedule).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("the domain barrel re-exports the same functions (identity, not copies)", () => {
    for (const name of EXPECTED_EXPORTS) {
      expect((barrelSchedule as Record<string, unknown>)[name]).toBe(
        (domainSchedule as Record<string, unknown>)[name],
      );
    }
  });

  it("the legacy path resolves to the same function objects as the domain", () => {
    expect(legacySchedule.getMissedScheduledPause).toBe(domainSchedule.getMissedScheduledPause);
    expect(legacySchedule.getNextScheduledPause).toBe(domainSchedule.getNextScheduledPause);
    expect(legacySchedule.toSafeDate).toBe(domainSchedule.toSafeDate);
  });

  it("the anti-farm ceiling and the pause windows survive the move", () => {
    expect(domainSchedule.SESSION_TIMEZONE).toBe("America/Sao_Paulo");
    expect(domainSchedule.SCHEDULED_PAUSE_TIMES).toEqual(["09:30", "12:00", "15:00", "17:00"]);
    expect(domainSchedule.MAX_STRETCH_SEC).toBe(9 * 3600);
  });

  it("behaviour is unchanged: a session started before 12:00 and read after it reports 12:00", () => {
    // Fixed instants so the assertion does not depend on when the suite runs.
    const start = new Date("2026-09-04T11:40:00-03:00");
    const now = new Date("2026-09-04T13:10:00-03:00");
    const missed = legacySchedule.getMissedScheduledPause(start, now);
    expect(missed).not.toBeNull();
    expect(missed!.toISOString()).toBe(new Date("2026-09-04T15:00:00Z").toISOString());
  });

  it("a session started after the last pause of the day crosses nothing", () => {
    const start = new Date("2026-09-04T17:30:00-03:00");
    const now = new Date("2026-09-04T18:45:00-03:00");
    expect(legacySchedule.getMissedScheduledPause(start, now)).toBeNull();
  });
});
