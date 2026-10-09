/**
 * Lab event fixtures — shapes mirror the `lab_events` entity contract
 * (entities/lab.ts `labEventSchema`; `date` is a DateTime column transported as
 * an ISO string). Times are built in LOCAL wall clock so the component's
 * `format(date, "HH:mm")` renders exactly the scheduled pause-style hour.
 */
import type { LabEvent } from "@/entities/lab";

let nextId = 700;

/** Local wall-clock date `daysFromToday` at HH:mm (no UTC drift). */
function localDayAt(daysFromToday: number, hhmm: string): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export function makeLabEvent(overrides: Partial<LabEvent> = {}): LabEvent {
  return {
    id: nextId++,
    userId: 2,
    userName: "Coordenador",
    date: localDayAt(1, "09:00"),
    note: "Evento de teste",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Canonical upcoming-window fixture: one event today (09:30), two ahead inside
 * the 14-day window and one far in the past (must be excluded by the window).
 */
export function labEventsFixture(): LabEvent[] {
  return [
    makeLabEvent({ id: 1, note: "Reunião geral da manhã", date: localDayAt(0, "09:30") }),
    makeLabEvent({ id: 2, note: "Entrega do relatório parcial", date: localDayAt(3, "14:00") }),
    makeLabEvent({ id: 3, note: "Manutenção do microscópio", date: localDayAt(6, "11:15") }),
    makeLabEvent({ id: 4, note: "Evento passado (fora da janela)", date: localDayAt(-40, "08:00") }),
  ];
}
