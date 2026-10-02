import { describe, expect, it } from "vitest";
import { getVisibleSlots } from "@/components/ui/day-view-calendar";

const DEFAULT_SLOTS = ["07:30", "09:30", "13:30", "15:50", "17:30", "19:30"];

describe("getVisibleSlots", () => {
  it("returns default slots for an empty day", () => {
    expect(getVisibleSlots([])).toEqual(DEFAULT_SLOTS);
  });

  it("includes event times and lab schedule boundaries", () => {
    const slots = getVisibleSlots([{ time: "10:00" }], [
      { startTime: "08:00", endTime: "12:00" },
    ]);
    expect(slots).toContain("10:00");
    expect(slots).toContain("08:00");
    expect(slots).toContain("12:00");
  });

  it("does not deduplicate or reorder slots", () => {
    const slots = getVisibleSlots([{ time: "09:30" }]);
    expect(slots.filter((s) => s === "09:30")).toHaveLength(1);
    expect([...slots].sort()).toEqual(slots);
  });

  it("windows to the relevant range when the slot list is large (>14)", () => {
    // Clustered morning schedules inflate the slot count beyond 14 while an
    // afternoon event keeps the rest of the day irrelevant.
    const morningPairs = [
      ["06:00", "06:30"],
      ["06:10", "06:40"],
      ["06:20", "06:50"],
      ["06:30", "07:00"],
      ["05:40", "06:05"],
    ];
    const labSchedules = morningPairs.map(([startTime, endTime]) => ({ startTime, endTime }));
    const events = [{ time: "13:30" }];

    const allSlots = getVisibleSlots(events, [...labSchedules, { startTime: "19:00", endTime: "19:30" }]);
    expect(allSlots.length).toBeGreaterThan(14);

    const slots = getVisibleSlots(events, labSchedules);
    // Evening slots fall outside the earliest..latest relevant window
    expect(slots).not.toContain("19:30");
    expect(slots).toContain("13:30");
  });

  it("keeps all slots when list is large but there are no events (empty day shows default view)", () => {
    const labSchedules = Array.from({ length: 6 }, (_, i) => ({
      startTime: `0${i + 1}:00`,
      endTime: `2${i}:30`,
    }));
    const slots = getVisibleSlots([], labSchedules);
    expect(slots.length).toBeGreaterThan(14);
  });
});
