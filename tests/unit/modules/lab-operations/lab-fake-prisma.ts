/**
 * OND8-B3 — harness compartilhado do contract test lab-operations (extraído do golden 8.1;
 * o golden mantém sua cópia inline intacta — DEC-15). Fake Prisma com SEMÂNTICA de schema:
 * issues.status/priority enums reais; LabNotice em `history`; lab_responsibilities String
 * ISO (range = query de OVERLAP AND/OR legada); replaceUserSchedules createMany cru.
 */

const ISSUE_STATUS = new Set(["open", "in_progress", "resolved", "closed"])
const ISSUE_PRIORITY = new Set(["low", "medium", "high", "urgent"])

export function createLabHarness() {
  function validationError(detail: string) {
    const e: any = new Error(`Invalid invocation:\n\n${detail}`)
    e.name = "PrismaClientValidationError"
    return e
  }
  function notFoundError(model: string) {
    const e: any = new Error(`Record not found: ${model}`)
    e.name = "PrismaClientKnownRequestError"
    e.code = "P2025"
    return e
  }

  interface World {
    users: any[]
    issues: any[]
    labEvents: any[]
    history: any[]
    labSchedules: any[]
    responsibilities: any[]
    userSchedules: any[]
    seq: {
      user: number
      issue: number
      labEvent: number
      history: number
      labSchedule: number
      responsibility: number
      userSchedule: number
    }
  }

  const world: World = {
    users: [],
    issues: [],
    labEvents: [],
    history: [],
    labSchedules: [],
    responsibilities: [],
    userSchedules: [],
    seq: { user: 1, issue: 1, labEvent: 1, history: 1, labSchedule: 1, responsibility: 1, userSchedule: 1 },
  }

  const applyDefined = (row: any, data: any) => {
    for (const key of Object.keys(data)) if (data[key] !== undefined) row[key] = data[key]
  }
  const assertIssueEnums = (data: any) => {
    if (data.status !== undefined && !ISSUE_STATUS.has(data.status)) throw validationError("Invalid value for `status`")
    if (data.priority !== undefined && !ISSUE_PRIORITY.has(data.priority)) throw validationError("Invalid value for `priority`")
  }
  const userRow = (id: number | null | undefined) => (id == null ? null : world.users.find((u) => u.id === id) ?? null)
  const withIssueIncludes = (row: any) => ({ ...row, reporter: userRow(row.reporterId), assignee: userRow(row.assigneeId) })
  const sortDesc = (rows: any[], key: string) => [...rows].sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0))
  const sortAsc = (rows: any[], key: string) => [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0))

  const tableOps = {
    users: {
      findUnique: async ({ where }: any) => {
        const row = world.users.find((u) => u.id === where.id!)
        return row ? { ...row, roles: [...row.roles] } : null
      },
      findMany: async ({ where }: any = {}) => {
        let rows = world.users
        if (where?.status) rows = rows.filter((u) => u.status === where.status)
        if (where?.roles?.hasSome) rows = rows.filter((u) => u.roles.some((r: string) => where.roles.hasSome.includes(r)))
        return sortDesc(rows, "createdAt").map((u) => ({ ...u, roles: [...u.roles] }))
      },
    },
    issues: {
      findUnique: async ({ where, include }: any) => {
        const row = world.issues.find((i) => i.id === where.id!)
        if (!row) return null
        return include?.reporter || include?.assignee ? withIssueIncludes(row) : { ...row }
      },
      findMany: async ({ where, include, take }: any = {}) => {
        let rows = world.issues
        if (where?.status !== undefined) rows = rows.filter((i) => i.status === where.status)
        if (where?.priority !== undefined) rows = rows.filter((i) => i.priority === where.priority)
        if (where?.category !== undefined) rows = rows.filter((i) => i.category === where.category)
        if (where?.reporterId !== undefined) rows = rows.filter((i) => i.reporterId === where.reporterId)
        if (where?.assigneeId !== undefined) rows = rows.filter((i) => i.assigneeId === where.assigneeId)
        let out = sortDesc(rows, "createdAt")
        if (take !== undefined) out = out.slice(0, take)
        return out.map((i) => (include?.reporter || include?.assignee ? withIssueIncludes(i) : { ...i }))
      },
      create: async ({ data, include }: any) => {
        assertIssueEnums(data)
        const row = {
          id: world.seq.issue++,
          title: data.title,
          description: data.description,
          status: data.status ?? "open",
          priority: data.priority ?? "medium",
          category: data.category ?? null,
          reporterId: data.reporterId,
          assigneeId: data.assigneeId ?? null,
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
          resolvedAt: data.resolvedAt ?? null,
        }
        world.issues.push(row)
        return include?.reporter || include?.assignee ? withIssueIncludes(row) : { ...row }
      },
      update: async ({ where, data, include }: any) => {
        assertIssueEnums(data)
        const row = world.issues.find((i) => i.id === where.id!)
        if (!row) throw notFoundError("issues")
        applyDefined(row, data)
        return include?.reporter || include?.assignee ? withIssueIncludes(row) : { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.issues.findIndex((i) => i.id === where.id!)
        if (idx === -1) throw notFoundError("issues")
        return world.issues.splice(idx, 1)[0]
      },
    },
    lab_events: {
      findUnique: async ({ where }: any) => {
        const row = world.labEvents.find((e) => e.id === where.id!)
        return row ? { ...row } : null
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        let rows = world.labEvents
        if (where?.userId !== undefined) rows = rows.filter((e) => e.userId === where.userId)
        if (where?.date) {
          if (where.date.gte !== undefined) rows = rows.filter((e) => e.date >= where.date.gte)
          if (where.date.lte !== undefined) rows = rows.filter((e) => e.date <= where.date.lte)
        }
        const dir = String(orderBy ?? "date").includes("desc") ? "desc" : "asc"
        return (dir === "desc" ? sortDesc(rows, "date") : sortAsc(rows, "date")).map((e) => ({ ...e }))
      },
      create: async ({ data }: any) => {
        const row = {
          id: world.seq.labEvent++,
          userId: data.userId,
          userName: data.userName,
          date: data.date,
          note: data.note,
          createdAt: data.createdAt ?? new Date(),
        }
        world.labEvents.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = world.labEvents.find((e) => e.id === where.id!)
        if (!row) throw notFoundError("lab_events")
        applyDefined(row, data)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.labEvents.findIndex((e) => e.id === where.id!)
        if (idx === -1) throw notFoundError("lab_events")
        return world.labEvents.splice(idx, 1)[0]
      },
    },
    history: {
      findMany: async ({ where }: any = {}) => {
        let rows = world.history
        if (where?.entityType) rows = rows.filter((h) => h.entityType === where.entityType)
        if (where?.action) rows = rows.filter((h) => h.action === where.action)
        return sortDesc(rows, "performedAt").map((h) => ({ ...h }))
      },
      findFirst: async ({ where }: any = {}) => {
        let rows = world.history
        if (where?.id !== undefined) rows = rows.filter((h) => h.id === where.id!)
        if (where?.entityType) rows = rows.filter((h) => h.entityType === where.entityType)
        if (where?.action) rows = rows.filter((h) => h.action === where.action)
        const first = sortDesc(rows, "performedAt")[0]
        return first ? { ...first } : null
      },
      create: async ({ data }: any) => {
        const row = {
          id: world.seq.history++,
          entityType: data.entityType,
          entityId: data.entityId,
          action: data.action,
          performedBy: data.performedBy,
          performedAt: data.performedAt ?? new Date(),
          oldValues: data.oldValues ?? null,
          newValues: data.newValues ?? null,
          description: data.description ?? null,
          metadata: data.metadata ?? null,
        }
        world.history.push(row)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.history.findIndex((h) => h.id === where.id!)
        if (idx === -1) throw notFoundError("history")
        return world.history.splice(idx, 1)[0]
      },
    },
    laboratory_schedules: {
      findUnique: async ({ where }: any) => {
        const row = world.labSchedules.find((s) => s.id === where.id!)
        return row ? { ...row } : null
      },
      findMany: async () =>
        [...world.labSchedules]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || (a.startTime < b.startTime ? -1 : 1))
          .map((s) => ({ ...s })),
      create: async ({ data }: any) => {
        const row = {
          id: world.seq.labSchedule++,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          notes: data.notes ?? null,
          createdAt: data.createdAt ?? new Date(),
          updatedAt: data.updatedAt ?? new Date(),
        }
        world.labSchedules.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = world.labSchedules.find((s) => s.id === where.id!)
        if (!row) throw notFoundError("laboratory_schedules")
        applyDefined(row, data)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.labSchedules.findIndex((s) => s.id === where.id!)
        if (idx === -1) throw notFoundError("laboratory_schedules")
        return world.labSchedules.splice(idx, 1)[0]
      },
    },
    lab_responsibilities: {
      findUnique: async ({ where }: any) => {
        const row = world.responsibilities.find((r) => r.id === where.id!)
        return row ? { ...row } : null
      },
      findMany: async ({ where }: any = {}) => {
        let rows = world.responsibilities
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId)
        if (where?.endTime === null) rows = rows.filter((r) => r.endTime === null)
        if (where?.pausedAt?.not === null) rows = rows.filter((r) => r.pausedAt !== null)
        if (where?.AND) {
          for (const clause of where.AND) {
            if (clause.startTime?.lte !== undefined) rows = rows.filter((r) => r.startTime <= clause.startTime.lte)
            if (clause.OR) {
              rows = rows.filter((r) =>
                clause.OR.some((c: any) => (c.endTime === null ? r.endTime === null : r.endTime !== null && r.endTime >= c.endTime.gte)),
              )
            }
          }
        }
        return sortDesc(rows, "startTime").map((r) => ({ ...r }))
      },
      findFirst: async ({ where }: any = {}) => {
        const rows = await tableOps.lab_responsibilities.findMany({ where })
        return rows[0] ?? null
      },
      create: async ({ data }: any) => {
        const row = {
          id: world.seq.responsibility++,
          userId: data.userId,
          userName: data.userName,
          startTime: data.startTime,
          endTime: data.endTime ?? null,
          pausedAt: data.pausedAt ?? null,
          totalPausedMs: data.totalPausedMs ?? 0,
          notes: data.notes ?? null,
        }
        world.responsibilities.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = world.responsibilities.find((r) => r.id === where.id!)
        if (!row) throw notFoundError("lab_responsibilities")
        applyDefined(row, data)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.responsibilities.findIndex((r) => r.id === where.id!)
        if (idx === -1) throw notFoundError("lab_responsibilities")
        return world.responsibilities.splice(idx, 1)[0]
      },
    },
    user_schedules: {
      findUnique: async ({ where }: any) => {
        const row = world.userSchedules.find((s) => s.id === where.id!)
        return row ? { ...row } : null
      },
      findMany: async ({ where }: any = {}) => {
        let rows = world.userSchedules
        if (where?.userId !== undefined) rows = rows.filter((s) => s.userId === where.userId)
        if (where?.dayOfWeek !== undefined) rows = rows.filter((s) => s.dayOfWeek === where.dayOfWeek)
        return [...rows]
          .sort((a, b) => a.userId - b.userId || a.dayOfWeek - b.dayOfWeek || (a.startTime < b.startTime ? -1 : 1))
          .map((s) => ({ ...s }))
      },
      create: async ({ data }: any) => {
        const row = {
          id: world.seq.userSchedule++,
          userId: data.userId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          createdAt: data.createdAt ?? new Date(),
        }
        world.userSchedules.push(row)
        return { ...row }
      },
      update: async ({ where, data }: any) => {
        const row = world.userSchedules.find((s) => s.id === where.id!)
        if (!row) throw notFoundError("user_schedules")
        applyDefined(row, data)
        return { ...row }
      },
      delete: async ({ where }: any) => {
        const idx = world.userSchedules.findIndex((s) => s.id === where.id!)
        if (idx === -1) throw notFoundError("user_schedules")
        return world.userSchedules.splice(idx, 1)[0]
      },
      deleteMany: async ({ where }: any) => {
        const before = world.userSchedules.length
        world.userSchedules = world.userSchedules.filter((s) => {
          if (where?.userId !== undefined && s.userId !== where.userId) return true
          return false
        })
        return { count: before - world.userSchedules.length }
      },
      createMany: async ({ data }: any) => {
        // createMany REAL não roda validação de repositório — escreve cru (QUIRK-8L13)
        for (const slot of data) {
          world.userSchedules.push({
            id: world.seq.userSchedule++,
            userId: slot.userId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            createdAt: new Date(),
          })
        }
        return { count: data.length }
      },
    },
  }

  const prisma = {
    ...tableOps,
    $transaction: async (arg: any) => {
      if (typeof arg === "function") return await arg(tableOps)
      return await Promise.all(arg)
    },
  }

  const published: any[] = []
  const notificationsSink = {
    publishEvent: async (event: any) => {
      published.push(event)
    },
  }

  const reset = () => {
    world.users = []
    world.issues = []
    world.labEvents = []
    world.history = []
    world.labSchedules = []
    world.responsibilities = []
    world.userSchedules = []
    world.seq = { user: 1, issue: 1, labEvent: 1, history: 1, labSchedule: 1, responsibility: 1, userSchedule: 1 }
    published.length = 0
  }

  const seedUser = (overrides: Partial<{ name: string; status: string; roles: string[] }> = {}) => {
    const row = {
      id: world.seq.user++,
      name: overrides.name ?? `Lab User ${world.seq.user}`,
      email: `lab-user-${world.seq.user}@test.local`,
      password: "hash",
      status: overrides.status ?? "active",
      roles: overrides.roles ?? ["VOLUNTARIO"],
      points: 0,
      completedTasks: 0,
      weekHours: 0,
      currentWeekHours: 0,
      createdAt: new Date(),
      avatar: null,
      bio: null,
      profileVisibility: "public",
    }
    world.users.push(row)
    return row
  }

  const snapshot = () =>
    JSON.parse(
      JSON.stringify({
        users: world.users,
        issues: world.issues,
        labEvents: world.labEvents,
        history: world.history,
        labSchedules: world.labSchedules,
        responsibilities: world.responsibilities,
        userSchedules: world.userSchedules,
      }),
    )

  return { world, prisma, published, notificationsSink, reset, seedUser, snapshot }
}

/** Singleton do contract test (importado ANTES dos módulos sob test — padrão TDZ da casa, DEC-18). */
export const labHarness = createLabHarness()
