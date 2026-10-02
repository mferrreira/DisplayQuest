import { describe, it, expect } from "vitest";
import {
  SCHEDULED_PAUSE_TIMES,
  getLastElapsedScheduledPause,
  getNextScheduledPause,
  getMinutesUntilNextPause,
  getMissedScheduledPause,
} from "@/lib/work-sessions/schedule";

// Helper: build a Date from an America/Sao_Paulo wall-clock time.
// Uses the same conversion logic under test indirectly, so we assert
// behavior through well-known instants instead of raw equality where possible.
function spWallClock(isoUtc: string) {
  const d = new Date(isoUtc);
  return d;
}

describe("SCHEDULED_PAUSE_TIMES", () => {
  it("contains exactly the four agreed times", () => {
    expect(SCHEDULED_PAUSE_TIMES).toEqual(["09:30", "12:00", "15:00", "17:00"]);
  });
});

describe("getLastElapsedScheduledPause", () => {
  it("returns null before the first pause of the day", () => {
    // 2026-08-25 08:00 São Paulo = 11:00 UTC
    const now = new Date("2026-08-25T11:00:00Z");
    expect(getLastElapsedScheduledPause(now)).toBeNull();
  });

  it("returns the previous pause between scheduled times", () => {
    // 10:45 SP = 13:45 UTC -> last pause was 09:30 SP = 12:30 UTC
    const now = new Date("2026-08-25T13:45:00Z");
    const result = getLastElapsedScheduledPause(now)!;
    expect(result.toISOString()).toBe("2026-08-25T12:30:00.000Z");
  });

  it("returns 17:00 of the current day after the last pause", () => {
    // 19:20 SP = 22:20 UTC -> last pause 17:00 SP = 20:00 UTC
    const now = new Date("2026-08-25T22:20:00Z");
    const result = getLastElapsedScheduledPause(now)!;
    expect(result.toISOString()).toBe("2026-08-25T20:00:00.000Z");
  });

  it("returns exactly the pause when now equals a pause time", () => {
    // 12:00 SP = 15:00 UTC
    const now = new Date("2026-08-25T15:00:00Z");
    expect(getLastElapsedScheduledPause(now)!.toISOString()).toBe(
      "2026-08-25T15:00:00.000Z",
    );
  });

  it("handles DST-shifted days without crashing and stays monotonic", () => {
    // Day after DST start in Brazil region (offset changes); just require sane ordering
    const early = new Date("2026-09-20T03:00:00Z"); // 00:00 SP
    const late = new Date("2026-09-20T23:00:00Z"); // ~20:00/21:00 SP depending on DST
    const a = getLastElapsedScheduledPause(early);
    const b = getLastElapsedScheduledPause(late)!;
    if (a !== null) expect(a.getTime()).toBeLessThanOrEqual(b.getTime());
    expect(b.getTime()).toBeLessThanOrEqual(late.getTime());
  });
});

describe("getNextScheduledPause", () => {
  it("returns today's next pause", () => {
    // 10:45 SP -> next is 12:00 SP = 15:00 UTC
    const now = new Date("2026-08-25T13:45:00Z");
    expect(getNextScheduledPause(now).toISOString()).toBe(
      "2026-08-25T15:00:00.000Z",
    );
  });

  it("rolls over to tomorrow's first pause after 17:00", () => {
    // 18:05 SP = 21:05 UTC -> next is tomorrow 09:30 SP = 26th 12:30 UTC
    const now = new Date("2026-08-25T21:05:00Z");
    expect(getNextScheduledPause(now).toISOString()).toBe(
      "2026-08-26T12:30:00.000Z",
    );
  });
});

describe("getMinutesUntilNextPause", () => {
  it("computes whole minutes until the next pause (ceiling)", () => {
    // 10:45:20 SP -> 12:00 SP = 1h14m40s -> ceil = 75
    const now = new Date("2026-08-25T13:45:20Z");
    expect(getMinutesUntilNextPause(now)).toBe(75);
  });

  it("counts down to the following pause when now equals a pause time", () => {
    // 12:00 SP exactly -> next pause is 15:00 SP (3h)
    const now = new Date("2026-08-25T15:00:00Z");
    expect(getMinutesUntilNextPause(now)).toBe(180);
  });

  it("is consistent with getNextScheduledPause", () => {
    const now = spWallClock("2026-08-25T14:10:00Z");
    const expected = Math.ceil(
      (getNextScheduledPause(now).getTime() - now.getTime()) / 60_000,
    );
    expect(getMinutesUntilNextPause(now)).toBe(expected);
  });
});

describe("getMissedScheduledPause", () => {
  it("returns null when the session started after the last pause", () => {
    // started 13:00 SP (16:00Z), now 13:30 SP -> no pause crossed
    const start = new Date("2026-08-25T16:00:00Z");
    const now = new Date("2026-08-25T16:30:00Z");
    expect(getMissedScheduledPause(start, now)).toBeNull();
  });

  it("pauses at the first missed pause, not the latest", () => {
    // started 08:00 SP (11:00Z), normalized at 13:00 SP (16:00Z) -> pause at 09:30 SP
    const start = new Date("2026-08-25T11:00:00Z");
    const now = new Date("2026-08-25T16:00:00Z");
    expect(getMissedScheduledPause(start, now)!.toISOString()).toBe(
      "2026-08-25T12:30:00.000Z",
    );
  });

  it("returns null when session started exactly at a pause time", () => {
    const start = new Date("2026-08-25T15:00:00Z"); // 12:00 SP
    const now = new Date("2026-08-25T15:30:00Z");
    expect(getMissedScheduledPause(start, now)).toBeNull();
  });

  it("finds a pause on the next day for sessions crossing midnight", () => {
    // started 23:50 SP Aug 25 = 02:50Z Aug 26; next pause 09:30 SP Aug 26 = 12:30Z
    const start = new Date("2026-08-26T02:50:00Z");
    const now = new Date("2026-08-26T13:00:00Z");
    expect(getMissedScheduledPause(start, now)!.toISOString()).toBe(
      "2026-08-26T12:30:00.000Z",
    );
  });
});
