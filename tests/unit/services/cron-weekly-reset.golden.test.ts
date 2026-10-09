/**
 * repo-cleanup B3 golden (DÍVIDA D1) — pina a semântica OBSERVÁVEL do reset semanal de
 * horas executado por CronService.executeWeeklyReset ANTES da migração para o
 * ResetWeeklyHoursHistoryUseCase (wiring nova do reporting).
 *
 * O golden afirma no STORE (fake-prisma world), não no caminho interno: fica verde tanto
 * com o Prisma cru de hoje (cron-service.ts:85-163) quanto após a migração (cron →
 * composition → reporting module). Semântica pinada do caminho cru:
 *   - linha em weekly_hours_history SOMENTE quando totalHours > 0 (ativo com 0h: sem linha);
 *   - currentWeekHours = 0 para TODO usuário ativo, mesmo com 0h (mesmo quirk do QUIRK-7C);
 *   - usuário inativo não é lido nem resetado;
 *   - sem dedup: execuções repetidas criam linhas repetidas (QUIRK-7C);
 *   - window = startOfWeek/endOfWeek(now, { weekStartsOn: 1 }) — a MESMA chamada date-fns de
 *     weekWindowFor (WEEK_OPTIONS em project-hours-rules.ts:24), logo a migração é
 *     semanticamente equivalente;
 *   - sessões fora do window ou não-completed não contam.
 *
 * Gotcha de import (mesmo da suíte bulk): o harness precisa ser importado ANTES do
 * cron-service — o vi.mock de @/lib/database/prisma roda na primeira importação da cadeia
 * (cron-service → composition root → adapters).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { startOfWeek, endOfWeek } from "date-fns"

import { reportingHarness } from "../modules/reporting/reporting-fake-prisma"

vi.mock("@/lib/database/prisma", () => ({ prisma: reportingHarness.prisma }))
// A cadeia composition root -> reporting -> ReportUploadsStorage -> lib/storage/report-uploads
// importa node builtins problemáticos no jsdom. O weekly reset não toca storage.
vi.mock("@/lib/storage/report-uploads", () => ({
  removeStoredReportFile: async (storedPath: string) => {
    reportingHarness.world.storage.removed.push(storedPath)
  },
  sweepStaleReportUploads: async (referenced: string[], maxAgeMs?: number) => {
    reportingHarness.world.storage.sweepCalls.push({ paths: referenced, maxAgeMs })
    return reportingHarness.world.storage.sweepResult
  },
}))

import { cronService } from "@/lib/services/cron-service"

const WEEK = { weekStartsOn: 1 } as const

function seedWorld(world: typeof reportingHarness.world) {
  const now = new Date()
  const weekStart = startOfWeek(now, WEEK)
  const weekEnd = endOfWeek(now, WEEK)
  world.users.push(
    { id: 1, name: "Ativo Com Horas", status: "active", currentWeekHours: 5, weekHours: 0 },
    { id: 2, name: "Ativo Sem Horas", status: "active", currentWeekHours: 7, weekHours: 0 },
    { id: 3, name: "Suspenso Com Horas", status: "suspended", currentWeekHours: 9, weekHours: 0 },
  )
  world.workSessions.push(
    // 2.5h completed DENTRO do window -> única linha de history esperada
    { id: 1, userId: 1, status: "completed", startTime: new Date(weekStart.getTime() + 24 * 3600_000), duration: 9000 },
    // completed FORA do window (semana anterior) -> não conta
    { id: 2, userId: 1, status: "completed", startTime: new Date(weekStart.getTime() - 2 * 24 * 3600_000), duration: 99999 },
    // não-completed -> não conta
    { id: 3, userId: 2, status: "active", startTime: new Date(weekStart.getTime() + 3600_000), duration: 1000 },
    // completed do inativo -> usuário nem é lido
    { id: 4, userId: 3, status: "completed", startTime: new Date(weekStart.getTime() + 3600_000), duration: 7200 },
  )
  return { weekStart, weekEnd }
}

describe("golden weekly reset — CronService.executeManualReset (D1, pré-migração)", () => {
  beforeEach(() => {
    reportingHarness.reset()
    seedWorld(reportingHarness.world)
  })

  it("cria history só para ativo com horas no window; zera currentWeekHours de TODO ativo", async () => {
    await cronService.executeManualReset()

    const world = reportingHarness.world
    expect(world.weeklyHours.length).toBe(1)
    expect(world.weeklyHours[0]).toMatchObject({
      userId: 1,
      userName: "Ativo Com Horas",
      totalHours: 2.5,
    })

    const u1 = world.users.find((u: any) => u.id === 1)
    const u2 = world.users.find((u: any) => u.id === 2)
    const u3 = world.users.find((u: any) => u.id === 3)
    expect(u1.currentWeekHours).toBe(0)
    expect(u2.currentWeekHours).toBe(0) // quirk: ativo com 0h também é zerado
    expect(u3.currentWeekHours).toBe(9) // inativo intocado
  })

  it("sem dedup: duas execuções criam duas linhas (QUIRK-7C)", async () => {
    await cronService.executeManualReset()
    await cronService.executeManualReset()
    expect(reportingHarness.world.weeklyHours.length).toBe(2)
  })
})
