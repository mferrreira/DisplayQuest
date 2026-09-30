/**
 * OND7-B3 — shared fake-prisma harness for the reporting CONTRACT suite (DEC-18).
 *
 * Same fake the golden (OND7-B1) uses, extracted to a module so BOTH sides of the parity
 * (the LEGACY PrismaReportingGateway and the new thin Prisma repositories) run over the
 * identical in-memory database via vi.mock("@/lib/database/prisma"). The golden file keeps
 * its own inline copy untouched (golden immutability rule).
 *
 * The fake models the schema semantics the reporting module depends on:
 *   - weekly_reports / weekly_hours_history / project_reports / report_attachments /
 *     daily_logs / work_sessions (+ work_session_tasks -> task select) / users / projects /
 *     project_members.
 *   - project_reports @@unique(projectId, periodType, periodStart, authorId) compound
 *     lookup; delete cascades report_attachments.
 *   - delete of a missing row throws P2025 (QUIRK-7K propagation path).
 */

export interface ReportingFakeWorld {
  users: any[]
  projects: any[]
  projectMembers: any[]
  tasks: any[]
  workSessions: any[]
  dailyLogs: any[]
  weeklyReports: any[]
  weeklyHours: any[]
  projectReports: any[]
  reportAttachments: any[]
  seq: {
    user: number
    project: number
    member: number
    task: number
    session: number
    dailyLog: number
    weeklyReport: number
    weeklyHours: number
    projectReport: number
    attachment: number
  }
  storage: { removed: string[]; sweepCalls: Array<{ paths: string[]; maxAgeMs?: number }>; sweepResult: number }
}

export function createReportingFake() {
  const world: ReportingFakeWorld = {
    users: [],
    projects: [],
    projectMembers: [],
    tasks: [],
    workSessions: [],
    dailyLogs: [],
    weeklyReports: [],
    weeklyHours: [],
    projectReports: [],
    reportAttachments: [],
    seq: {
      user: 1,
      project: 1,
      member: 1,
      task: 1,
      session: 1,
      dailyLog: 1,
      weeklyReport: 1,
      weeklyHours: 1,
      projectReport: 1,
      attachment: 1,
    },
    storage: { removed: [], sweepCalls: [], sweepResult: 0 },
  }

  const clone = (v: any) => (v == null ? v : structuredClone(v))

  const notFound = (model: string, id: unknown) => {
    const err = new Error(`Record not found: ${model} ${String(id)}`)
    ;(err as any).code = "P2025"
    return err
  }

  const pick = (row: any, select: any) => {
    if (row == null) return null
    if (!select) return clone(row)
    const out: any = {}
    for (const k of Object.keys(select)) if (select[k]) out[k] = row[k]
    return out
  }

  const okDate = (d: Date | null, cond: any): boolean => {
    if (!cond) return true
    if (d == null) return false
    const t = d.getTime()
    if (cond.gte !== undefined && !(t >= cond.gte.getTime())) return false
    if (cond.lte !== undefined && !(t <= cond.lte.getTime())) return false
    if (cond.lt !== undefined && !(t < cond.lt.getTime())) return false
    if (cond.gt !== undefined && !(t > cond.gt.getTime())) return false
    return true
  }

  const sameDate = (a: Date, b: Date) => a.getTime() === b.getTime()

  const withSessionInclude = (s: any, include: any) => {
    if (!include) return clone(s)
    const row: any = { ...s }
    if (include.user) {
      row.user = pick(world.users.find((u) => u.id === s.userId) ?? null, include.user.select ?? null)
    }
    if (include.project) {
      const p = world.projects.find((pr) => pr.id === s.projectId) ?? null
      row.project = p ? pick(p, include.project.select ?? null) : null
    }
    if (include.dailyLog) {
      const dl = world.dailyLogs.find((l) => l.workSessionId === s.id) ?? null
      row.dailyLog = dl ? pick(dl, include.dailyLog.select ?? null) : null
    }
    if (include.tasks) {
      row.tasks = (s.tasks ?? []).map((st: any) => {
        const task = world.tasks.find((t) => t.id === st.taskId) ?? null
        return { ...clone(st), task: task ? pick(task, include.tasks.include?.task?.select ?? null) : null }
      })
    }
    return row
  }

  const prisma: any = {
    users: {
      async findUnique({ where, select }: any) {
        const row = world.users.find((u) => u.id === where.id)
        return row ? pick(row, select) : null
      },
      async findMany({ where, select }: any) {
        let rows = [...world.users]
        if (where?.status !== undefined) rows = rows.filter((u) => u.status === where.status)
        if (where?.roles?.hasSome !== undefined) {
          rows = rows.filter((u) => (u.roles ?? []).some((r: string) => where.roles.hasSome.includes(r)))
        }
        if (where?.NOT?.id !== undefined) rows = rows.filter((u) => u.id !== where.NOT.id)
        return rows.map((r) => pick(r, select))
      },
      async update({ where, data }: any) {
        const row = world.users.find((u) => u.id === where.id)
        if (!row) throw notFound("users", where.id)
        for (const [k, v] of Object.entries(data as any)) row[k] = v
        return clone(row)
      },
    },
    projects: {
      async findUnique({ where, select }: any) {
        const row = world.projects.find((p) => p.id === where.id)
        return row ? pick(row, select) : null
      },
      async findFirst({ where, select }: any) {
        const row = world.projects.find(
          (p) =>
            (where.id === undefined || p.id === where.id) &&
            (where.leaderId === undefined || p.leaderId === where.leaderId),
        )
        return row ? pick(row, select) : null
      },
      async findMany({ where, include }: any) {
        let base = [...world.projects]
        if (where?.leaderId !== undefined) base = base.filter((p) => p.leaderId === where.leaderId)
        if (where?.id !== undefined) base = base.filter((p) => p.id === where.id)
        return base.map((p) => {
          const row: any = clone(p)
          if (include?.members) {
            row.members = world.projectMembers
              .filter((m) => m.projectId === p.id)
              .map((m) => {
                const mm: any = clone(m)
                if (include.members.include?.user) {
                  mm.user = pick(world.users.find((u) => u.id === m.userId) ?? null, include.members.include.user.select ?? null)
                }
                return mm
              })
          }
          return row
        })
      },
    },
    project_members: {
      async findMany({ where, include }: any) {
        let rows = [...world.projectMembers]
        if (where?.userId !== undefined) rows = rows.filter((m) => m.userId === where.userId)
        if (where?.projectId !== undefined) rows = rows.filter((m) => m.projectId === where.projectId)
        return rows.map((m) => {
          const row: any = clone(m)
          if (include?.project) {
            row.project = clone(world.projects.find((p) => p.id === m.projectId) ?? null)
          }
          return row
        })
      },
    },
    weekly_reports: {
      async findMany({ where }: any) {
        let rows = [...world.weeklyReports]
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId)
        rows = rows.filter((r) => okDate(r.weekStart, where?.weekStart))
        rows = rows.filter((r) => okDate(r.weekEnd, where?.weekEnd))
        rows.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
        return rows.map(clone)
      },
      async findUnique({ where }: any) {
        const row = world.weeklyReports.find((r) => r.id === where.id)
        return row ? clone(row) : null
      },
      async findFirst({ where, select }: any) {
        const row = world.weeklyReports.find(
          (r) =>
            r.userId === where.userId &&
            sameDate(r.weekStart, where.weekStart) &&
            sameDate(r.weekEnd, where.weekEnd),
        )
        return row ? pick(row, select) : null
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.weeklyReport++,
          userId: data.userId,
          userName: data.userName,
          weekStart: data.weekStart,
          weekEnd: data.weekEnd,
          totalLogs: data.totalLogs ?? 0,
          summary: data.summary ?? null,
          createdAt: data.createdAt ?? new Date(),
        }
        world.weeklyReports.push(row)
        return clone(row)
      },
      async update({ where, data }: any) {
        const row = world.weeklyReports.find((r) => r.id === where.id)
        if (!row) throw notFound("weekly_reports", where.id)
        for (const k of ["userName", "totalLogs", "summary"]) {
          if (data[k] !== undefined) row[k] = data[k]
        }
        return clone(row)
      },
      async delete({ where }: any) {
        const idx = world.weeklyReports.findIndex((r) => r.id === where.id)
        if (idx === -1) throw notFound("weekly_reports", where.id)
        world.weeklyReports.splice(idx, 1)
      },
    },
    work_sessions: {
      async count({ where }: any) {
        let rows = [...world.workSessions]
        if (where?.status !== undefined) rows = rows.filter((s) => s.status === where.status)
        if (where?.userId !== undefined) rows = rows.filter((s) => s.userId === where.userId)
        if (where?.projectId !== undefined) rows = rows.filter((s) => s.projectId === where.projectId)
        rows = rows.filter((s) => okDate(s.startTime, where?.startTime))
        return rows.length
      },
      async findMany({ where, include, select }: any) {
        let rows = [...world.workSessions]
        if (where?.status !== undefined) rows = rows.filter((s) => s.status === where.status)
        if (where?.userId !== undefined) rows = rows.filter((s) => s.userId === where.userId)
        if (where?.projectId !== undefined) rows = rows.filter((s) => s.projectId === where.projectId)
        rows = rows.filter((s) => okDate(s.startTime, where?.startTime))
        rows.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        if (select) return rows.map((r) => pick(r, select))
        return rows.map((r) => withSessionInclude(r, include))
      },
    },
    daily_logs: {
      async findMany({ where, include }: any) {
        let rows = [...world.dailyLogs]
        if (where?.projectId !== undefined) rows = rows.filter((l) => l.projectId === where.projectId)
        if (where?.userId !== undefined) rows = rows.filter((l) => l.userId === where.userId)
        rows = rows.filter((l) => okDate(l.date, where?.date))
        rows.sort((a, b) => b.date.getTime() - a.date.getTime())
        return rows.map((l) => {
          const row: any = clone(l)
          if (include?.user) row.user = pick(world.users.find((u) => u.id === l.userId) ?? null, include.user.select ?? null)
          if (include?.project) {
            const p = world.projects.find((pr) => pr.id === l.projectId) ?? null
            row.project = p ? pick(p, include.project.select ?? null) : null
          }
          if (include?.workSession) {
            const ws = world.workSessions.find((s) => s.id === l.workSessionId) ?? null
            row.workSession = ws ? pick(ws, include.workSession.select ?? null) : null
          }
          return row
        })
      },
    },
    weekly_hours_history: {
      async findMany({ where, orderBy, include }: any) {
        let rows = [...world.weeklyHours]
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId)
        rows = rows.filter((r) => okDate(r.weekStart, where?.weekStart))
        if (orderBy?.totalHours === "desc") {
          rows.sort((a, b) => b.totalHours - a.totalHours)
        } else {
          rows.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime())
        }
        return rows.map((r) => {
          const row: any = clone(r)
          if (include?.user) {
            row.user = pick(world.users.find((u) => u.id === r.userId) ?? null, include.user.select ?? null)
          }
          return row
        })
      },
      async findFirst({ where }: any) {
        const row = world.weeklyHours.find(
          (r) =>
            (where?.userId === undefined || r.userId === where.userId) &&
            (where?.weekStart === undefined || sameDate(r.weekStart, where.weekStart)),
        )
        return row ? clone(row) : null
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.weeklyHours++,
          userId: data.userId,
          userName: data.userName,
          weekStart: data.weekStart,
          weekEnd: data.weekEnd,
          totalHours: data.totalHours,
          createdAt: data.createdAt ?? new Date(),
        }
        world.weeklyHours.push(row)
        return clone(row)
      },
    },
    project_reports: {
      async findUnique({ where, include, select }: any) {
        let row: any
        if (where.id !== undefined) {
          row = world.projectReports.find((r) => r.id === where.id)
        } else {
          const c = where.projectId_periodType_periodStart_authorId
          row = world.projectReports.find(
            (r) =>
              r.projectId === c.projectId &&
              r.periodType === c.periodType &&
              sameDate(r.periodStart, c.periodStart) &&
              r.authorId === c.authorId,
          )
        }
        if (!row) return null
        if (select) return pick(row, select)
        const out: any = clone(row)
        if (include?.project) out.project = pick(world.projects.find((p) => p.id === row.projectId) ?? null, include.project.select ?? null)
        if (include?.author) out.author = pick(world.users.find((u) => u.id === row.authorId) ?? null, include.author.select ?? null)
        if (include?.attachments) {
          out.attachments = world.reportAttachments
            .filter((a) => a.reportId === row.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(clone)
        }
        return out
      },
      async findMany({ where, select }: any) {
        let rows = [...world.projectReports]
        if (where?.projectId?.in !== undefined) rows = rows.filter((r) => where.projectId.in.includes(r.projectId))
        else if (where?.projectId !== undefined) rows = rows.filter((r) => r.projectId === where.projectId)
        if (where?.periodType !== undefined) rows = rows.filter((r) => r.periodType === where.periodType)
        if (where?.authorId !== undefined) rows = rows.filter((r) => r.authorId === where.authorId)
        rows = rows.filter((r) => okDate(r.periodStart, where?.periodStart))
        rows.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
        return rows.map((r) => pick(r, select))
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.projectReport++,
          projectId: data.projectId,
          authorId: data.authorId,
          periodType: data.periodType,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          title: data.title ?? null,
          content: data.content,
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
        }
        world.projectReports.push(row)
        return clone(row)
      },
      async update({ where, data }: any) {
        const row = world.projectReports.find((r) => r.id === where.id)
        if (!row) throw notFound("project_reports", where.id)
        for (const k of ["title", "content", "periodStart", "periodEnd", "periodType"]) {
          if (data[k] !== undefined) row[k] = data[k]
        }
        row.updatedAt = new Date()
        return clone(row)
      },
      async delete({ where }: any) {
        const idx = world.projectReports.findIndex((r) => r.id === where.id)
        if (idx === -1) throw notFound("project_reports", where.id)
        world.projectReports.splice(idx, 1)
        for (let i = world.reportAttachments.length - 1; i >= 0; i--) {
          if (world.reportAttachments[i].reportId === where.id) world.reportAttachments.splice(i, 1)
        }
      },
    },
    report_attachments: {
      async findMany({ where, select }: any) {
        let rows = [...world.reportAttachments]
        if (where?.reportId !== undefined) rows = rows.filter((a) => a.reportId === where.reportId)
        return rows.map((r) => pick(r, select))
      },
      async findUnique({ where }: any) {
        const row = world.reportAttachments.find((a) => a.id === where.id)
        return row ? clone(row) : null
      },
      async create({ data }: any) {
        const row = {
          id: data.id ?? world.seq.attachment++,
          reportId: data.reportId,
          fileName: data.fileName,
          storedPath: data.storedPath,
          mimeType: data.mimeType,
          sizeBytes: data.sizeBytes,
          uploadedBy: data.uploadedBy,
          createdAt: data.createdAt ?? new Date(),
        }
        world.reportAttachments.push(row)
        return clone(row)
      },
      async delete({ where }: any) {
        const idx = world.reportAttachments.findIndex((a) => a.id === where.id)
        if (idx === -1) throw notFound("report_attachments", where.id)
        world.reportAttachments.splice(idx, 1)
      },
    },
  }

  const reset = () => {
    world.users = []
    world.projects = []
    world.projectMembers = []
    world.tasks = []
    world.workSessions = []
    world.dailyLogs = []
    world.weeklyReports = []
    world.weeklyHours = []
    world.projectReports = []
    world.reportAttachments = []
    world.seq = {
      user: 1,
      project: 1,
      member: 1,
      task: 1,
      session: 1,
      dailyLog: 1,
      weeklyReport: 1,
      weeklyHours: 1,
      projectReport: 1,
      attachment: 1,
    }
    world.storage.removed = []
    world.storage.sweepCalls = []
    world.storage.sweepResult = 0
  }

  return { world, prisma, reset, notFound }
}

/**
 * Singleton instance used by the CONTRACT suite: the vi.mock factories for
 * "@/lib/database/prisma" and "@/lib/storage/report-uploads" read it during the import
 * phase (the harness module is imported FIRST in the contract file, so the bindings are
 * initialized before the gateway/adapter imports trigger the factories — no TDZ).
 */
export const reportingHarness = createReportingFake()

/** Deterministic store snapshot for parity comparison (Dates -> ISO). */
export function snapshotReportingWorld(world: ReportingFakeWorld): string {
  return JSON.stringify({
    users: world.users,
    projects: world.projects,
    projectMembers: world.projectMembers,
    tasks: world.tasks,
    workSessions: world.workSessions,
    dailyLogs: world.dailyLogs,
    weeklyReports: world.weeklyReports,
    weeklyHours: world.weeklyHours,
    projectReports: world.projectReports,
    reportAttachments: world.reportAttachments,
    storage: world.storage,
  })
}
