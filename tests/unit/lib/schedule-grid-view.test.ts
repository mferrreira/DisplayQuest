import { describe, expect, it } from "vitest";
import {
  buildScheduleColumns,
  filterSchedulesByMemberIds,
  getVisibleTimeSlots,
  groupSchedulesByUser,
} from "@/lib/schedule-grid-view";

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

describe("buildScheduleColumns", () => {
  const slots = [
    { start: "08:00", end: "08:30" },
    { start: "08:30", end: "09:00" },
    { start: "09:00", end: "09:30" },
    { start: "09:30", end: "10:00" },
    { start: "10:00", end: "10:30" },
    { start: "10:30", end: "11:00" },
  ];

  it("um bloco vira uma celula so, com rowSpan sobre os slots que cobre", () => {
    const columns = buildScheduleColumns(
      [{ id: 7, userId: 1, dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }],
      slots,
      5,
    );

    const column = columns[1];
    expect(column.map((c) => c.kind)).toEqual([
      "empty",
      "empty",
      "start",
      "covered",
      "covered",
      "covered",
    ]);
    const cell = column[2];
    if (cell.kind !== "start") throw new Error("esperava start");
    expect(cell.rowSpan).toBe(4);
    expect(cell.blocks).toHaveLength(1);
    expect(cell.blocks[0].schedule.id).toBe(7);
  });

  it("blocos adjacentes no mesmo dia nao se sobrepoem", () => {
    const columns = buildScheduleColumns(
      [
        { id: 1, userId: 1, dayOfWeek: 0, startTime: "08:00", endTime: "09:00" },
        { id: 2, userId: 1, dayOfWeek: 0, startTime: "09:00", endTime: "10:00" },
      ],
      slots,
      5,
    );

    expect(columns[0].map((c) => c.kind)).toEqual([
      "start",
      "covered",
      "start",
      "covered",
      "empty",
      "empty",
    ]);
  });

  it("bloco fora do alinhamento do slot e recortado na janela visivel", () => {
    const columns = buildScheduleColumns(
      [{ id: 3, userId: 1, dayOfWeek: 2, startTime: "09:10", endTime: "10:20" }],
      slots,
      5,
    );

    expect(columns[2].map((c) => c.kind)).toEqual([
      "empty",
      "empty",
      "start",
      "covered",
      "covered",
      "empty",
    ]);
    const cell = columns[2][2];
    if (cell.kind !== "start") throw new Error("esperava start");
    expect(cell.rowSpan).toBe(3);
  });

  it("bloco fora da janela e ignorado", () => {
    const columns = buildScheduleColumns(
      [
        { id: 4, userId: 1, dayOfWeek: 0, startTime: "08:00", endTime: "08:30" },
        { id: 5, userId: 1, dayOfWeek: 0, startTime: "20:00", endTime: "21:00" },
      ],
      slots,
      5,
    );

    expect(columns[0].map((c) => c.kind)).toEqual([
      "start",
      "empty",
      "empty",
      "empty",
      "empty",
      "empty",
    ]);
  });

  it("dois blocos no mesmo slot empilham na mesma celula", () => {
    const columns = buildScheduleColumns(
      [
        { id: 6, userId: 1, dayOfWeek: 3, startTime: "09:00", endTime: "10:00" },
        { id: 8, userId: 2, dayOfWeek: 3, startTime: "09:00", endTime: "11:00" },
      ],
      slots,
      5,
    );

    const cell = columns[3][2];
    if (cell.kind !== "start") throw new Error("esperava start");
    expect(cell.blocks.map((b) => b.schedule.id)).toEqual([6, 8]);
    expect(cell.rowSpan).toBe(4);
  });

  it("outros dias e bloqueios invalidos nao aparecem", () => {
    const columns = buildScheduleColumns(
      [
        { id: 9, userId: 1, dayOfWeek: 9, startTime: "09:00", endTime: "10:00" },
        { id: 10, userId: 1, dayOfWeek: 1, startTime: "10:00", endTime: "10:00" },
      ],
      slots,
      5,
    );

    expect(columns.flat().every((c) => c.kind === "empty")).toBe(true);
  });

  it("sem slots, devolve uma matriz vazia por dia", () => {
    const columns = buildScheduleColumns(
      [{ id: 11, userId: 1, dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }],
      [],
      5,
    );
    expect(columns).toHaveLength(5);
    expect(columns[0]).toEqual([]);
  });
});
