import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const scheduleMock = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => ({ stop: vi.fn() })),
);
vi.mock("node-cron", () => ({
  default: { schedule: scheduleMock },
  schedule: scheduleMock,
}));

const listWorkSessionsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/backend/composition/root", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/backend/composition/root")>();
  return {
    ...actual,
    getBackendComposition: () => ({
      workExecution: {
        listWorkSessions: listWorkSessionsMock,
      },
    }),
  };
});

import { CronService } from "@/lib/services/cron-service";
import { SCHEDULED_PAUSE_TIMES } from "@/backend/domain/work";

/**
 * repo-cleanup B3 (D2) derivou as expressões de SCHEDULED_PAUSE_TIMES agrupando por
 * minuto. A cópia manual anterior ('30 9,15 * * *' / '0 12,17 * * *') divergia do
 * domínio em silêncio: '30 9,15' disparava 15:30, que NÃO está em SCHEDULED_PAUSE_TIMES.
 * Este teste deriva as expressões esperadas do domínio em vez de hardcodá-las, para que
 * uma futura mudança de horário quebre aqui em vez de divergir em silêncio.
 */
function expectedPauseExpressions(): string[] {
  const byMinute = new Map<number, number[]>();
  for (const t of SCHEDULED_PAUSE_TIMES) {
    const [h, m] = t.split(":").map(Number);
    byMinute.set(m, [...(byMinute.get(m) ?? []), h]);
  }
  return [...byMinute.entries()].map(
    ([m, hs]) => `${m} ${hs.sort((a, b) => a - b).join(",")} * * *`,
  );
}

describe("CronService scheduled pause jobs", () => {
  beforeEach(() => {
    scheduleMock.mockClear();
    listWorkSessionsMock.mockClear();
    // fresh instance to bypass singleton init guard
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers pause jobs at 09:30/15:00 and 12:00/17:00 in SP timezone", () => {
    const service = new CronService();
    service.init();

    const calls = scheduleMock.mock.calls.map((c) => c[0]);
    const expected = expectedPauseExpressions();
    // sanidade: as expressões derivadas batem com o agrupamento por minuto do domínio
    expect(expected).toEqual(["30 9 * * *", "0 12,15,17 * * *"]);
    for (const expr of expected) {
      expect(calls).toContain(expr);
    }

    for (const call of scheduleMock.mock.calls) {
      if (expected.includes(call[0] as string)) {
        expect(call[2]).toMatchObject({ timezone: "America/Sao_Paulo" });
      }
    }
    service.stop();
  });

  it("pause job normalizes active sessions via work-execution module", async () => {
    const service = new CronService();
    service.init();

    const pauseJob = scheduleMock.mock.calls.find(
      ([expr]) => expr === "30 9 * * *",
    );
    const handler = pauseJob![1] as () => Promise<void>;
    await handler();

    expect(listWorkSessionsMock).toHaveBeenCalledWith({ status: "active" });
    service.stop();
  });
});

export {};
