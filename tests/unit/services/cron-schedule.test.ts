/**
 * repo-cleanup B3 (DÍVIDA D2) — pina a agenda do CronService:
 * as expressões cron de pausa são DERIVADAS de SCHEDULED_PAUSE_TIMES (domínio).
 *
 * Divergência corrigida (documentada, evolução como o 500→400 do bulk): as expressões
 * legadas '30 9,15 * * *' / '0 12,17 * * * disparavam pausa em 09:30, 12:00, 15:30 e
 * 17:00 — 15:30 NÃO está em SCHEDULED_PAUSE_TIMES (09:30, 12:00, 15:00, 17:00). O gatilho
 * do cron estava 30 min defasado contra a regra de domínio que a normalização usa.
 * Agora: '30 9 * * *' + '0 12,15,17 * * *' = exatamente os quatro horários do domínio.
 * Impacto: persistência do auto-pause das 15:00 passa a ocorrer às 15:00 (antes 15:30);
 * leituras intermediárias já eram normalizadas lazy, então nenhum estado muda — só o
 * momento da gravação.
 *
 * Se alguém editar SCHEDULED_PAUSE_TIMES sem rodar os gates, este teste é onde a
 * divergência cron×domínio aparece.
 */
import { describe, expect, it, vi } from "vitest"

import { reportingHarness } from "../modules/reporting/reporting-fake-prisma"

vi.mock("@/lib/database/prisma", () => ({ prisma: reportingHarness.prisma }))
vi.mock("@/lib/storage/report-uploads", () => ({
  removeStoredReportFile: async () => undefined,
  sweepStaleReportUploads: async () => 0,
}))

const scheduled: Array<{ expression: string; options: { timezone?: string } }> = []
vi.mock("node-cron", () => ({
  schedule: (expression: string, _fn: unknown, options: { timezone?: string }) => {
    scheduled.push({ expression, options })
    return { stop: () => undefined }
  },
}))

import { cronService } from "@/lib/services/cron-service"
import { SCHEDULED_PAUSE_TIMES } from "@/backend/domain/work"

describe("cron schedule — derivado do domínio (D2)", () => {
  it("init agenda as expressões derivadas do domínio, todas em America/Sao_Paulo", () => {
    cronService.init()

    expect(scheduled.map((s) => s.expression)).toEqual([
      "0 0 * * 1", // weekly reset (segunda 00:00)
      "30 9 * * *", // pausa 09:30
      "0 12,15,17 * * *", // pausa 12:00, 15:00 e 17:00
      "59 23 * * *", // sweep noturno anti-farm
    ])
    for (const s of scheduled) {
      expect(s.options.timezone).toBe("America/Sao_Paulo")
    }
  })

  it("as expressões de pausa reproduzem SCHEDULED_PAUSE_TIMES do domínio", () => {
    cronService.init()

    const pauseExpressions = scheduled
      .map((s) => s.expression)
      .filter((e) => e !== "0 0 * * 1" && e !== "59 23 * * *")

    const covered = new Set<string>()
    for (const expr of pauseExpressions) {
      const [minute, hours] = expr.split(" ")
      for (const hour of hours.split(",")) {
        covered.add(`${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`)
      }
    }
    expect([...covered].sort()).toEqual([...SCHEDULED_PAUSE_TIMES].sort())
  })
})
