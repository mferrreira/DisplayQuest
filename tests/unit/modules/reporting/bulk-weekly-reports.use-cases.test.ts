/**
 * Bulk weekly-report generation (feature 64a6095) PORTED to the clean-arch wiring during the
 * origin/dev merge (branch refactor/clean-arch).
 *
 * Bulk is NEW feature code, not legacy behavior being replaced — there is no old wiring in
 * production to pin old-vs-new against. The regression net here is:
 *   1. the FULL new wiring (bulk use case -> UpsertWeeklyReportUseCase -> thin Prisma
 *      repositories) over the shared reporting fake-prisma harness;
 *   2. the orchestration contract frozen verbatim from 64a6095: period loop order, ISO
 *      strings, per-period `reports = activeUsers.length`, counts, error messages verbatim;
 *   3. validation failures now typed ValidationError (route maps to 400 via
 *      domainErrorResponse — documented evolution from the legacy 500).
 *
 * The INNER upsert semantics (QUIRK-7I window normalization etc.) are already pinned by
 * contract.reporting.test.ts; this file only pins the bulk orchestration on top of it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// O harness fake precisa ser importado ANTES dos adapters: a factory do vi.mock abaixo roda
// na primeira importacao de @/lib/database/prisma (puxada pelos adapters) e referencia
// reportingHarness — ordem de import ESM importa aqui.
import {
  reportingHarness,
  snapshotReportingWorld,
  type ReportingFakeWorld,
} from "./reporting-fake-prisma"
import { ValidationError, userActor } from "@/backend/domain"
import type { ReportPeriod } from "@/backend/domain/reporting"
import { createReportingModule } from "@/backend/modules/reporting"
import { PrismaHoursReadRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-hours-read.repository"
import { PrismaReportingDirectory } from "@/backend/modules/reporting/infrastructure/repositories/prisma-reporting-directory"
import { PrismaWeeklyReportsRepository } from "@/backend/modules/reporting/infrastructure/repositories/prisma-weekly-reports.repository"
import { listPeriods } from "@/lib/constants/report-periods"

vi.mock("@/lib/database/prisma", () => ({ prisma: reportingHarness.prisma }))
// Mesmo mock do contract suite: createReportingModule importa ReportUploadsStorage ->
// lib/storage/report-uploads (node builtins problemáticos no jsdom). Bulk nao toca storage.
vi.mock("@/lib/storage/report-uploads", () => ({
  removeStoredReportFile: async (storedPath: string) => {
    reportingHarness.world.storage.removed.push(storedPath)
  },
  sweepStaleReportUploads: async (referenced: string[], maxAgeMs?: number) => {
    reportingHarness.world.storage.sweepCalls.push({ paths: referenced, maxAgeMs })
    return reportingHarness.world.storage.sweepResult
  },
}))

type ReportingModuleNew = ReturnType<typeof createReportingModule>

/**
 * B6-3 (D4): bulkGenerateWeeklyReports passou a exigir ator (MANAGE_USERS puro, gate antes
 * das validacoes). Este arquivo exercita orquestracao e mensagens — o ator e o harness com
 * MANAGE_USERS; a negacao por papel esta em use-cases.weekly-report-authorization.test.ts.
 */
const managerActor = userActor(1, ["COORDENADOR"])

function newModule(): ReportingModuleNew {
  return createReportingModule({
    ports: {
      weeklyReports: new PrismaWeeklyReportsRepository(),
      hoursRead: new PrismaHoursReadRepository(),
      directory: new PrismaReportingDirectory(),
    },
  })
}

function seedUser(world: ReportingFakeWorld, over: any = {}) {
  const u = {
    id: "id" in over ? over.id : world.seq.user++,
    name: over.name ?? `Usuario ${over.id ?? 0}`,
    email: over.email ?? `u${over.id ?? 0}@example.com`,
    roles: over.roles ?? ["VOLUNTARIO"],
    status: over.status ?? "active",
    currentWeekHours: over.currentWeekHours ?? 0,
  }
  world.users.push(u)
  return u
}

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
    return "__no_error__"
  } catch (error) {
    return error
  }
}

describe("BulkGenerateWeeklyReportsUseCase (wiring nova, merge 64a6095)", () => {
  let world: ReportingFakeWorld

  beforeEach(() => {
    reportingHarness.reset()
    world = reportingHarness.world
  })

  describe("caminho feliz", () => {
    it("gera um relatorio por usuario ATIVO por periodo (inativos ignorados)", async () => {
      seedUser(world, { id: 1, name: "Ana" })
      seedUser(world, { id: 2, name: "Bruno" })
      seedUser(world, { id: 3, name: "Carla", status: "suspended" })

      const from = "2026-09-07"
      const to = "2026-09-20"
      const expectedPeriods = listPeriods("weekly", new Date(from), new Date(to))
      expect(expectedPeriods.length).toBeGreaterThan(0)

      const result = await newModule().bulkGenerateWeeklyReports({
        actor: managerActor,
        periodType: "weekly",
        from,
        to,
      })

      // Orquestracao verbatim de 64a6095: label/start/end vindos de listPeriods, ISO strings,
      // reports = numero de usuarios ativos, contadores consistentes.
      expect(result.periodCount).toBe(expectedPeriods.length)
      expect(result.reportCount).toBe(expectedPeriods.length * 2)
      expect(result.periods).toEqual(
        expectedPeriods.map((period) => ({
          label: period.label,
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          reports: 2,
        })),
      )

      // Store: exatamente uma linha weekly_report por (usuario ativo x periodo).
      expect(world.weeklyReports.length).toBe(result.reportCount)
      const userIds = new Set(world.weeklyReports.map((row: any) => row.userId))
      expect([...userIds].sort()).toEqual([1, 2])
    })

    it("reexecucao he idempotente (upsert atualiza, nao duplica)", async () => {
      seedUser(world, { id: 1 })
      seedUser(world, { id: 2 })

      const reportingModule = newModule()
      const first = await reportingModule.bulkGenerateWeeklyReports({
        actor: managerActor,
        periodType: "weekly",
        from: "2026-09-07",
        to: "2026-09-20",
      })
      const second = await reportingModule.bulkGenerateWeeklyReports({
        actor: managerActor,
        periodType: "weekly",
        from: "2026-09-07",
        to: "2026-09-20",
      })

      expect(second).toEqual(first)
      expect(world.weeklyReports.length).toBe(first.reportCount)
    })
  })

  describe("validacoes (mensagens verbatim, ValidationError tipado)", () => {
    const cases: Array<{ title: string; command: any }> = [
      { title: "periodicidade invalida", command: { actor: managerActor, periodType: "quinzenal", from: "2026-09-07", to: "2026-09-20" } },
      { title: "datas invalidas", command: { actor: managerActor, periodType: "weekly", from: "banana", to: "2026-09-20" } },
      { title: "data final anterior a inicial", command: { actor: managerActor, periodType: "weekly", from: "2026-09-20", to: "2026-09-07" } },
      {
        title: "limite de 52 periodos excedido",
        command: { actor: managerActor, periodType: "weekly", from: "2025-01-06", to: "2026-09-20" },
      },
    ]

    for (const { title, command } of cases) {
      it(`lanca ValidationError em ${title} sem escrever nada`, async () => {
        seedUser(world, { id: 1 })
        const before = snapshotReportingWorld(world)

        const error = await captureError(() => newModule().bulkGenerateWeeklyReports(command))

        expect(error).toBeInstanceOf(ValidationError)
        expect((error as Error).message).not.toBe("__no_error__")
        expect(snapshotReportingWorld(world)).toBe(before)
      })
    }

    it("mantem as mensagens legadas verbatim", async () => {
      seedUser(world, { id: 1 })
      const reportingModule = newModule()

      expect(
        (await captureError(() => reportingModule.bulkGenerateWeeklyReports({ actor: managerActor, periodType: "x" as unknown as ReportPeriod, from: "2026-09-07", to: "2026-09-20" })) as Error).message,
      ).toBe("Periodicidade inválida")
      expect(
        (await captureError(() => reportingModule.bulkGenerateWeeklyReports({ actor: managerActor, periodType: "weekly", from: "banana", to: "2026-09-20" })) as Error).message,
      ).toBe("Intervalo de datas inválido")
      expect(
        (await captureError(() => reportingModule.bulkGenerateWeeklyReports({ actor: managerActor, periodType: "weekly", from: "2026-09-20", to: "2026-09-07" })) as Error).message,
      ).toBe("A data final não pode ser anterior à data inicial")
      expect(
        (await captureError(() => reportingModule.bulkGenerateWeeklyReports({ actor: managerActor, periodType: "weekly", from: "2025-01-06", to: "2026-09-20" })) as Error).message,
      ).toBe("Limite de 52 períodos por geração em lote excedido")
    })

    it("falta quando nao ha usuarios ativos (e nao escreve nada)", async () => {
      seedUser(world, { id: 1, status: "suspended" })
      const before = snapshotReportingWorld(world)

      const error = await captureError(() =>
        newModule().bulkGenerateWeeklyReports({ actor: managerActor, periodType: "weekly", from: "2026-09-07", to: "2026-09-20" }),
      )

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as Error).message).toBe("Nenhum usuário ativo disponível para geração em lote")
      expect(snapshotReportingWorld(world)).toBe(before)
    })
  })
})
