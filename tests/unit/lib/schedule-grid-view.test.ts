import { describe, expect, it } from "vitest";
import { filterSchedulesByMemberIds, getVisibleTimeSlots, groupSchedulesByUser } from "@/lib/schedule-grid-view";

const ALL_SLOTS = [
  { start: "07:00", end: "07:30" },
  { start: "07:30", end: "08:00" },
  { start: "08:00", end: "08:30" },
  { start: "08:30", end: "09:00" },
  { start: "09:00", end: "09:30" },
  { start: "12:00", end: "12:30" },
  { start: "17:00", end: "17:30" },
];

describe("getVisibleTimeSlots", () => {
  it("returns all slots when there are no schedules", () => {
    expect(getVisibleTimeSlots([], ALL_SLOTS)).toEqual(ALL_SLOTS);
  });

  it("trims to slots overlapping the earliest start and latest end", () => {
    const slots = getVisibleTimeSlots(
      [
        { startTime: "07:40", endTime: "09:10" },
        { startTime: "08:00", endTime: "12:15" },
      ],
      ALL_SLOTS,
    );
    // First slot whose end > 07:40 is 07:30-08:00; last slot whose start < 12:15 is 12:00-12:30
    expect(slots[0]).toEqual({ start: "07:30", end: "08:00" });
    expect(slots[slots.length - 1]).toEqual({ start: "12:00", end: "12:30" });
    expect(slots).not.toContainEqual({ start: "07:00", end: "07:30" });
    expect(slots).not.toContainEqual({ start: "17:00", end: "17:30" });
  });
});

describe("groupSchedulesByUser", () => {
  const users = [
    { id: 2, name: "Ana" },
    { id: 1, name: "Bruno" },
  ];

  it("groups by user, sorts entries and orders groups by name", () => {
    const groups = groupSchedulesByUser(
      [
        { userId: 1, dayOfWeek: 3, startTime: "14:00", endTime: "18:00" },
        { userId: 2, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { userId: 2, dayOfWeek: 3, startTime: "08:00", endTime: "10:00" },
      ],
      users,
    );

    expect(groups.map((g) => g.userName)).toEqual(["Ana", "Bruno"]);
    expect(groups[0].entries).toEqual([
      { dayOfWeek: 1, timeRange: "09:00–12:00" },
      { dayOfWeek: 3, timeRange: "08:00–10:00" },
    ]);
    expect(groups[1].entries).toEqual([
      { dayOfWeek: 3, timeRange: "14:00–18:00" },
    ]);
  });

  it("falls back to a generic name for unknown users", () => {
    const groups = groupSchedulesByUser([{ userId: 99, dayOfWeek: 0, startTime: "08:00", endTime: "09:00" }], users);
    expect(groups[0].userName).toBe("Usuário");
  });
});

describe("filterSchedulesByMemberIds", () => {
  const schedules = [
    { id: 1, userId: 1, dayOfWeek: 1, startTime: "08:00", endTime: "09:00" },
    { id: 2, userId: 2, dayOfWeek: 1, startTime: "09:00", endTime: "10:00" },
    { id: 3, userId: 2, dayOfWeek: 3, startTime: "14:00", endTime: "15:00" },
    { id: 4, userId: 3, dayOfWeek: 5, startTime: "10:00", endTime: "11:00" },
  ];

  it("returns all schedules when the selection is empty", () => {
    expect(filterSchedulesByMemberIds(schedules, new Set())).toEqual(schedules);
  });

  it("returns only the selected member's schedules", () => {
    expect(filterSchedulesByMemberIds(schedules, new Set([2]))).toEqual([
      schedules[1],
      schedules[2],
    ]);
  });

  it("combines schedules of multiple selected members", () => {
    expect(filterSchedulesByMemberIds(schedules, new Set([1, 3]))).toEqual([
      schedules[0],
      schedules[3],
    ]);
  });

  it("does not mutate the original array", () => {
    const snapshot = schedules.map((s) => ({ ...s }));
    filterSchedulesByMemberIds(schedules, new Set([2]));
    expect(schedules).toEqual(snapshot);
  });

  it("returns an empty list when the selection matches nothing", () => {
    expect(filterSchedulesByMemberIds(schedules, new Set([999]))).toEqual([]);
  });

  it("returns an empty list when there are no schedules", () => {
    expect(filterSchedulesByMemberIds([], new Set([1]))).toEqual([]);
  });
});
