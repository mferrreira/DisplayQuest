// @vitest-environment node
/**
 * V6-11k (pedido do dono) — a limpeza diária do feed "Atividade recente".
 *
 * O que ESTE arquivo congela (a parte que o DELETE no banco exige que seja medida):
 *   1. o corte é o INÍCIO DO DIA CIVIL de hoje em America/Sao_Paulo — a MESMA função que a
 *      rota de leitura usa (`startOfCivilDayInstant`), não uma segunda conta de "hoje";
 *   2. o cron fala com o módulo pela porta (`purgeTaskActivity`), que por sua vez só apaga
 *      `entityType "task"` (a trava dura está documentada na porta e medida no adapter);
 *   3. falha da limpeza NÃO propaga: vira `console.error` e a rotina volta no dia seguinte —
 *      log de limpeza não derruba job nenhum.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { purge } = vi.hoisted(() => ({ purge: vi.fn<(cutoff: Date) => Promise<number>>() }))

vi.mock("@/backend/composition/root", () => ({
  getBackendComposition: () => ({ taskManagement: { purgeTaskActivity: purge } }),
}))
// O agendador não agenda nada neste teste; importar o módulo já é suficiente.
vi.mock("node-cron", () => ({ schedule: () => ({ stop: () => undefined }) }))
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }))

import { cronService } from "@/lib/services/cron-service"

describe("CronService.executeTaskActivityCleanup (V6-11k)", () => {
  beforeEach(() => {
    purge.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-17T12:34:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("corta no início do dia civil (00:00 de Brasília) e loga quantos saíram", async () => {
    purge.mockResolvedValue(5)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cronService.executeTaskActivityCleanup()

    // 12:34 UTC de 17/10 é 09:34 em Brasília -> o dia começou em 17/10 00:00 SP = 03:00 UTC.
    expect(purge).toHaveBeenCalledTimes(1)
    expect(purge.mock.calls[0][0].toISOString()).toBe("2026-10-17T03:00:00.000Z")
    expect(log).toHaveBeenCalledWith(expect.stringContaining("5 registro"))
  })

  it("madrugada UTC ainda conta como o dia anterior — o corte é a meia-noite DELE", async () => {
    vi.setSystemTime(new Date("2026-10-17T02:30:00.000Z")) // 23:30 de 16/10 em Brasília
    purge.mockResolvedValue(0)
    vi.spyOn(console, "log").mockImplementation(() => undefined)

    await cronService.executeTaskActivityCleanup()

    expect(purge.mock.calls[0][0].toISOString()).toBe("2026-10-16T03:00:00.000Z")
  })

  it("falha da limpeza só vira console.error — não propaga", async () => {
    purge.mockRejectedValue(new Error("banco fora"))
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(cronService.executeTaskActivityCleanup()).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
