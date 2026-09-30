// @vitest-environment node
/**
 * OND8-B1 — golden suite do LAB-OPERATIONS legado (R0).
 *
 * Pinado sobre o gateway INTACTO (DefaultLabOperationsGateway + os 6 IssueRepository/
 * LabEventRepository/LabNoticeRepository/LaboratoryScheduleRepository/LabResponsibilityRepository/
 * UserScheduleRepository + UserRepository reais) sobre fake Prisma com semântica de schema
 * (DEC-15/R0): issues.status/priority são enums reais (valor inválido -> PrismaClientValidation
 * Error); LabNotice mora na tabela `history`; lab_responsibilities.startTime/endTime/pausedAt
 * são String ISO; replaceUserSchedules usa createMany (SEM validação).
 * notificationsModule fake grava os publishEvent; identityAccess REAL (hasAnyRole é puro).
 *
 * QUIRKS pinados:
 *  QUIRK-8L1: LabNotice persistido em history (entityType LAB_NOTICE, action CREATE, entityId 0,
 *    performedBy=userId, description=note, metadata.userName); fallback userName "Usuario".
 *  QUIRK-8L2: createIssue força status OPEN apesar do gateway passar "in_progress" (Issue.create
 *    sobrescreve depois do spread).
 *  QUIRK-8L3: listIssues precedência mutuamente exclusiva status > priority > category >
 *    reporterId > assigneeId > search (em memória) > findAll; createdAt DESC.
 *  QUIRK-8L4: updateIssue aceita priority arbitrary string -> Prisma enum validation error.
 *  QUIRK-8L5: resolveIssue aceita `resolution` mas NUNCA persiste (sem coluna); só valida blank.
 *  QUIRK-8L6: assignIssue força status in_progress mesmo a partir de resolved/closed.
 *  QUIRK-8L7: unassignIssue força status open mesmo a partir de resolved/closed.
 *  QUIRK-8L8: notify LAB_ISSUE_RAISED p/ LABORATORISTA/COORDENADOR/GERENTE ativos exceto reporter;
 *    falha de notificação engolida com console.error (issue continua criada).
 *  QUIRK-8L9: acesso a lab-event/notice: dono OU papel em {COORDENADOR,GERENTE,LABORATORISTA};
 *    cross-user exige prioridade ESTRITAMENTE maior (tabela GERENTE5/COORDENADOR4/LABORATORISTA3/
 *    GERENTE_PROJETO2=PESQUISADOR2/COLABORADOR1=VOLUNTARIO1).
 *  QUIRK-8L10: startResponsibility exige papel de lab e só existe UMA responsabilidade ativa
 *    GLOBAL (findActiveResponsibility não filtra usuário).
 *  QUIRK-8L11: endResponsibility/deleteResponsibility NÃO checam acesso no gateway (a rota checa);
 *    end: notes falsy preserva notes existentes.
 *  QUIRK-8L12: laboratory schedule update ignora dayOfWeek e nunca limpa notes ("" -> undefined
 *    -> Prisma não escreve).
 *  QUIRK-8L13: updateUserSchedule ignora dayOfWeek; replaceUserSchedules bypassa validação
 *    (createMany escreve slots inválidos).
 *  QUIRK-8L14: leitura de grades é aberta (qualquer autenticado); escrita exige MANAGE_USERS.
 *  QUIRK-8L15: pause é no-op silencioso se já pausada/ausente; resume só em pausada;
 *    totalPausedMs acumula no resume.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ISSUE_STATUS = new Set(["open", "in_progress", "resolved", "closed"])
const ISSUE_PRIORITY = new Set(["low", "medium", "high", "urgent"])

const fake = vi.hoisted(() => {
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
    seq: { user: number; issue: number; labEvent: number; history: number; labSchedule: number; responsibility: number; userSchedule: number }
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
        return row ? { ...row } : null
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
  const notificationsModule = {
    publishEvent: async (event: any) => {
      published.push(event)
    },
  }

  return { world, prisma, published, notificationsModule }
})

vi.mock("@/lib/database/prisma", () => ({ prisma: fake.prisma }))

import { createLabOperationsModule } from "@/backend/modules/lab-operations"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"

const labOperations = createLabOperationsModule({
  gatewayDependencies: {
    notificationsModule: fake.notificationsModule as any,
    identityAccess: createIdentityAccessModule(),
  },
})

function seedUser(overrides: Partial<{ name: string; status: string; roles: string[] }> = {}) {
  const row = {
    id: fake.world.seq.user++,
    name: overrides.name ?? `Lab User ${fake.world.seq.user}`,
    email: `lab-user-${fake.world.seq.user}@test.local`,
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
  fake.world.users.push(row)
  return row
}

beforeEach(() => {
  fake.world.users = []
  fake.world.issues = []
  fake.world.labEvents = []
  fake.world.history = []
  fake.world.labSchedules = []
  fake.world.responsibilities = []
  fake.world.userSchedules = []
  fake.world.seq = { user: 1, issue: 1, labEvent: 1, history: 1, labSchedule: 1, responsibility: 1, userSchedule: 1 }
  fake.published.length = 0
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

// ================= ISSUES =================

describe("issues", () => {
  it("QUIRK-8L2: createIssue força OPEN apesar do gateway pedir in_progress; notify LAB_ISSUE_RAISED", async () => {
    const reporter = seedUser({ roles: ["VOLUNTARIO"] })
    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const inactiveCoord = seedUser({ roles: ["COORDENADOR"], status: "inactive" })

    const issue = await labOperations.createIssue({ title: " Impressora quebrada ", description: " papel atolado ", reporterId: reporter.id! })
    expect(issue.status).toBe("open")
    expect(issue.title).toBe("Impressora quebrada") // trim no Issue.create
    expect(issue.priority).toBe("medium")
    expect(issue.assigneeId).toBeNull()

    expect(fake.published).toHaveLength(1)
    expect(fake.published[0]).toMatchObject({ eventType: "LAB_ISSUE_RAISED", title: "Nova issue do laboratório" })
    expect(fake.published[0].audience.userIds).toEqual([lab.id]) // inativo e reporter fora
  })

  it("validações legadas verbatim", async () => {
    const reporter = seedUser()
    await expect(labOperations.createIssue({ title: "  ", description: "d", reporterId: reporter.id! })).rejects.toThrow("Título do issue é obrigatório")
    await expect(labOperations.createIssue({ title: "t", description: " ", reporterId: reporter.id! })).rejects.toThrow("Descrição do issue é obrigatória")
    await expect(labOperations.createIssue({ title: "t", description: "d", reporterId: 0 })).rejects.toThrow("Reporter do issue é obrigatório")
    await expect(labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id!, priority: "urgente" })).rejects.toThrow("Prioridade inválida")
  })

  it("QUIRK-8L8: falha de notificação é engolida com console.error; issue continua criada", async () => {
    const reporter = seedUser()
    seedUser({ roles: ["LABORATORISTA"] }) // destinatario existe para o publishEvent ser tentado
    const spy = vi.spyOn(fake.notificationsModule, "publishEvent").mockRejectedValueOnce(new Error("bus down"))
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    expect(issue.id!).toBeTruthy()
    expect(console.error).toHaveBeenCalledWith("Erro ao publicar notificação de issue reportada:", expect.any(Error))
    spy.mockRestore()
  })

  it("QUIRK-8L3: precedência mutuamente exclusiva + search em memória + createdAt DESC", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"))
    const reporter = seedUser()
    const assignee = seedUser()
    await labOperations.createIssue({ title: "Alpha", description: "impressora", reporterId: reporter.id!, category: "equipamento", priority: "high" })
    vi.setSystemTime(new Date("2026-09-16T12:00:01.000Z"))
    const second = await labOperations.createIssue({ title: "Beta", description: "rede caiu", reporterId: reporter.id!, assigneeId: assignee.id!, category: "rede" })
    await labOperations.closeIssue(second.id!)

    expect((await labOperations.listIssues()).map((i) => i.title)).toEqual(["Beta", "Alpha"])
    // status vence priority
    expect((await labOperations.listIssues({ status: "closed", priority: "high" })).map((i) => i.title)).toEqual(["Beta"])
    // priority vence category
    expect((await labOperations.listIssues({ priority: "high", category: "rede" })).map((i) => i.title)).toEqual(["Alpha"])
    // category vence reporterId
    expect((await labOperations.listIssues({ category: "rede", reporterId: 999 })).map((i) => i.title)).toEqual(["Beta"])
    // reporterId vence assigneeId
    expect((await labOperations.listIssues({ reporterId: reporter.id!, assigneeId: 999 })).map((i) => i.title)).toEqual(["Beta", "Alpha"])
    // search (em memória: title/description/category, case-insensitive)
    expect((await labOperations.listIssues({ search: " IMPRESSORA " })).map((i) => i.title)).toEqual(["Alpha"])
    expect((await labOperations.listIssues({ search: "equipamento" })).map((i) => i.title)).toEqual(["Alpha"])
    // query vazia => findAll
    expect((await labOperations.listIssues({ status: "", priority: "" })).map((i) => i.title)).toEqual(["Beta", "Alpha"])
  })

  it("QUIRK-8L4: updateIssue escreve priority arbitrary -> enum validation do Prisma", async () => {
    const reporter = seedUser()
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    const err: any = await labOperations.updateIssue(issue.id!, { priority: "urgente" }).catch((e) => e)
    expect(err.name).toBe("PrismaClientValidationError")
    expect(err.message).toContain("Invalid value for `priority`")

    const updated = await labOperations.updateIssue(issue.id!, { title: "novo titulo", category: null })
    expect(updated.title).toBe("novo titulo")
    expect(updated.category).toBeNull()

    await expect(labOperations.updateIssue(999, { title: "x" })).rejects.toThrow("Issue não encontrado")
    await expect(labOperations.updateIssue(issue.id!, { title: "  " })).rejects.toThrow("Título do issue é obrigatório")
  })

  it("QUIRK-8L6/8L7: assign força in_progress (mesmo de resolved); unassign força open (mesmo de closed) + notify", async () => {
    const reporter = seedUser()
    const assignee = seedUser({ roles: ["LABORATORISTA"] })
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    await labOperations.resolveIssue(issue.id!)

    const assigned = await labOperations.assignIssue(issue.id!, assignee.id!)
    expect(assigned.status).toBe("in_progress") // resolved -> in_progress
    expect(fake.published.some((e) => e.eventType === "LAB_ISSUE_ASSIGNED" && e.audience.userIds[0] === assignee.id!)).toBe(true)

    await labOperations.closeIssue(issue.id!)
    const unassigned = await labOperations.unassignIssue(issue.id!)
    expect(unassigned.status).toBe("open") // closed -> open
    expect(unassigned.assigneeId).toBeNull()

    await expect(labOperations.assignIssue(issue.id!, 999)).rejects.toThrow("Usuário não encontrado")
    await expect(labOperations.assignIssue(999, assignee.id!)).rejects.toThrow("Issue não encontrado")
  })

  it("startIssueProgress só a partir de open", async () => {
    const reporter = seedUser()
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    const started = await labOperations.startIssueProgress(issue.id!)
    expect(started.status).toBe("in_progress")
    await expect(labOperations.startIssueProgress(issue.id!)).rejects.toThrow("Apenas issues abertos podem ser iniciados")
  })

  it("QUIRK-8L5: resolveIssue aceita resolution mas NUNCA persiste; closed bloqueia; blank rejeita", async () => {
    const reporter = seedUser()
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    const resolved = await labOperations.resolveIssue(issue.id!, "troquei o papel")
    expect(resolved.status).toBe("resolved")
    expect(resolved.resolvedAt).toBeInstanceOf(Date)
    expect((resolved as any).resolution).toBeUndefined()
    expect(fake.world.issues[0]).not.toHaveProperty("resolution")

    await expect(labOperations.resolveIssue(issue.id!, "   ")).rejects.toThrow("Descrição da resolução é obrigatória")
    const reResolved = await labOperations.resolveIssue(issue.id!) // re-resolve idempotente (so closed bloqueia)
    expect(reResolved.status).toBe("resolved")
  })

  it("close/reopen: reopen só de closed e limpa resolvedAt", async () => {
    const reporter = seedUser()
    const issue = await labOperations.createIssue({ title: "t", description: "d", reporterId: reporter.id! })
    await labOperations.resolveIssue(issue.id!)
    const closed = await labOperations.closeIssue(issue.id!)
    expect(closed.status).toBe("closed")
    await expect(labOperations.closeIssue(issue.id!)).rejects.toThrow("Issue já está fechado")

    const reopened = await labOperations.reopenIssue(issue.id!)
    expect(reopened.status).toBe("open")
    expect(reopened.resolvedAt).toBeNull()
    await expect(labOperations.reopenIssue(issue.id!)).rejects.toThrow("Apenas issues fechados podem ser reabertos")

    await labOperations.deleteIssue(issue.id!)
    expect(fake.world.issues).toHaveLength(0)
    await expect(labOperations.deleteIssue(issue.id!)).rejects.toThrow("Issue não encontrado")
  })
})

// ================= LAB EVENTS =================

describe("lab events", () => {
  it("create exige usuário existente e ATIVO; validação do repositório 'Dados inválidos: ...'", async () => {
    const active = seedUser()
    const inactive = seedUser({ status: "inactive" })

    await expect(labOperations.createLabEvent({ userId: 999, userName: "X", date: new Date(), note: "n" })).rejects.toThrow("Usuário não encontrado")
    await expect(labOperations.createLabEvent({ userId: inactive.id!, userName: "X", date: new Date(), note: "n" })).rejects.toThrow(
      "Usuário não tem permissão para criar eventos",
    )
    await expect(labOperations.createLabEvent({ userId: active.id!, userName: " ", date: new Date(), note: "n" })).rejects.toThrow(
      "Dados inválidos: Nome do usuário é obrigatório",
    )
    await expect(labOperations.createLabEvent({ userId: active.id!, userName: "X", date: new Date("invalid"), note: "n" })).rejects.toThrow(
      "Dados inválidos: Data do evento inválida",
    )
    await expect(labOperations.createLabEvent({ userId: active.id!, userName: "X", date: new Date(), note: "  " })).rejects.toThrow(
      "Dados inválidos: Nota do evento é obrigatória",
    )

    const event = await labOperations.createLabEvent({ userId: active.id!, userName: active.name, date: new Date("2026-09-15T12:00:00.000Z"), note: "feriado" })
    expect(event.userName).toBe(active.name)
  })

  it("listLabEventsByDate usa janela do DIA LOCAL (setHours 0..23:59:59.999), ASC", async () => {
    const user = seedUser()
    const day = new Date(2026, 8, 15) // 15/09/2026 local
    await labOperations.createLabEvent({ userId: user.id!, userName: user.name, date: new Date(2026, 8, 15, 8, 0), note: "manha" })
    await labOperations.createLabEvent({ userId: user.id!, userName: user.name, date: new Date(2026, 8, 15, 18, 30), note: "tarde" })
    await labOperations.createLabEvent({ userId: user.id!, userName: user.name, date: new Date(2026, 8, 16, 0, 30), note: "fora" })

    const found = await labOperations.listLabEventsByDate(new Date(2026, 8, 15, 12, 0))
    expect(found.map((e) => e.note)).toEqual(["manha", "tarde"])

    const ranged = await labOperations.listLabEventsByRange({ startDate: new Date(2026, 8, 15), endDate: new Date(2026, 8, 16, 23, 59) })
    expect(ranged.map((e) => e.note)).toEqual(["manha", "tarde", "fora"])
  })

  it("QUIRK-8L9: acesso a update/delete — dono ok; papel lab ok p/ perfil inferior; prioridade igual/superior bloqueia", async () => {
    const voluntario = seedUser({ roles: ["VOLUNTARIO"] })
    const alvo = seedUser({ roles: ["VOLUNTARIO"] })
    const laboratorista = seedUser({ roles: ["LABORATORISTA"] })
    const gerente = seedUser({ roles: ["GERENTE"] })

    const ownEvent = await labOperations.createLabEvent({ userId: voluntario.id!, userName: voluntario.name, date: new Date("2026-09-15T12:00:00.000Z"), note: "proprio" })
    const labEvent = await labOperations.createLabEvent({ userId: alvo.id!, userName: alvo.name, date: new Date("2026-09-16T12:00:00.000Z"), note: "p/ lab editar" })
    const gerenteEvent = await labOperations.createLabEvent({ userId: gerente.id!, userName: gerente.name, date: new Date("2026-09-17T12:00:00.000Z"), note: "do gerente" })

    // dono edita o proprio
    const edited = await labOperations.updateLabEvent({ eventId: ownEvent.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles, note: "editado" })
    expect(edited.note).toBe("editado")

    // LABORATORISTA edita evento de VOLUNTARIO (3 > 1)
    await labOperations.updateLabEvent({ eventId: labEvent.id!, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles, note: "pelo lab" })

    // VOLUNTARIO em evento alheio => sem papel
    await expect(labOperations.updateLabEvent({ eventId: labEvent.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles, note: "x" })).rejects.toThrow(
      "Usuário não tem permissão para editar este evento",
    )
    // LABORATORISTA em evento de GERENTE (3 <= 5)
    await expect(labOperations.updateLabEvent({ eventId: gerenteEvent.id!, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles, note: "x" })).rejects.toThrow(
      "Usuário não tem permissão para editar eventos deste perfil",
    )
    // ator inexistente
    await expect(labOperations.updateLabEvent({ eventId: labEvent.id!, actorUserId: 999, actorRoles: ["COORDENADOR"], note: "x" })).rejects.toThrow("Usuário não encontrado")
    // evento inexistente
    await expect(labOperations.updateLabEvent({ eventId: 999, actorUserId: voluntario.id!, actorRoles: voluntario.roles, note: "x" })).rejects.toThrow("Evento não encontrado")
    // data invalida / nota blank — validacao so depois do acesso (dono alvo passa no acesso)
    await expect(labOperations.updateLabEvent({ eventId: labEvent.id!, actorUserId: alvo.id!, actorRoles: alvo.roles, date: new Date("nope") })).rejects.toThrow("Data do evento inválida")
    await expect(labOperations.updateLabEvent({ eventId: labEvent.id!, actorUserId: alvo.id!, actorRoles: alvo.roles, note: "  " })).rejects.toThrow("Nota do evento é obrigatória")

    // delete com as mesmas regras
    await expect(labOperations.deleteLabEvent({ eventId: gerenteEvent.id!, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles })).rejects.toThrow(
      "Usuário não tem permissão para remover eventos deste perfil",
    )
    await labOperations.deleteLabEvent({ eventId: ownEvent.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles })
    await expect(labOperations.deleteLabEvent({ eventId: ownEvent.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles })).rejects.toThrow("Evento não encontrado")
  })
})

// ================= LAB NOTICES (tabela history) =================

describe("lab notices (QUIRK-8L1)", () => {
  it("persistido em history (entityType LAB_NOTICE, action CREATE, entityId 0); fallback userName 'Usuario'", async () => {
    const user = seedUser()
    const notice = await labOperations.createLabNotice({ userId: user.id!, userName: user.name, note:  "  aviso importante  " })
    expect(notice.note).toBe("aviso importante")

    const row = fake.world.history[0]
    expect(row).toMatchObject({ entityType: "LAB_NOTICE", entityId: 0, action: "CREATE", performedBy: user.id!, description: "aviso importante" })
    expect(row.metadata).toEqual({ userName: user.name })

    const listed = await labOperations.listLabNotices()
    expect(listed.map((n) => n.note)).toEqual(["aviso importante"])

    // linha history sem metadata => fallback "Usuario"
    await fake.prisma.history.create({
      data: { entityType: "LAB_NOTICE", entityId: 0, action: "CREATE", performedBy: user.id!, description: "sem meta" },
    })
    const listed2 = await labOperations.listLabNotices()
    const semMeta = listed2.find((n) => n.note === "sem meta")
    expect(semMeta?.userName).toBe("Usuario")
  })

  it("validações: aviso obrigatório; usuário inativo; delete com regras de prioridade", async () => {
    const voluntario = seedUser({ roles: ["VOLUNTARIO"] })
    const laboratorista = seedUser({ roles: ["LABORATORISTA"] })
    const gerente = seedUser({ roles: ["GERENTE"] })
    const inactive = seedUser({ status: "inactive" })

    await expect(labOperations.createLabNotice({ userId: 999, userName: "X", note: "n" })).rejects.toThrow("Usuário não encontrado")
    await expect(labOperations.createLabNotice({ userId: inactive.id!, userName: "X", note: "n" })).rejects.toThrow("Usuário não tem permissão para criar avisos")
    await expect(labOperations.createLabNotice({ userId: voluntario.id!, userName: "X", note: "   " })).rejects.toThrow("Aviso é obrigatório")

    const own = await labOperations.createLabNotice({ userId: voluntario.id!, userName: voluntario.name, note: "do voluntario" })
    const doGerente = await labOperations.createLabNotice({ userId: gerente.id!, userName: gerente.name, note: "do gerente" })

    // dono remove o proprio
    await labOperations.deleteLabNotice({ noticeId: own.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles })

    // VOLUNTARIO remove aviso alheio => sem papel
    await expect(labOperations.deleteLabNotice({ noticeId: doGerente.id!, actorUserId: voluntario.id!, actorRoles: voluntario.roles })).rejects.toThrow(
      "Usuário não tem permissão para remover este aviso",
    )
    // LABORATORISTA remove aviso de GERENTE (3 <= 5)
    await expect(labOperations.deleteLabNotice({ noticeId: doGerente.id!, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles })).rejects.toThrow(
      "Usuário não tem permissão para remover avisos deste perfil",
    )
    // LABORATORISTA remove aviso de VOLUNTARIO (3 > 1)
    const doLab = await labOperations.createLabNotice({ userId: voluntario.id!, userName: voluntario.name, note: "outro" })
    await labOperations.deleteLabNotice({ noticeId: doLab.id!, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles })

    await expect(labOperations.deleteLabNotice({ noticeId: 999, actorUserId: laboratorista.id!, actorRoles: laboratorista.roles })).rejects.toThrow("Aviso não encontrado")
  })
})

// ================= LABORATORY SCHEDULES =================

describe("laboratory schedules", () => {
  it("permissão por papel (COORDENADOR/GERENTE/LABORATORISTA); validação 'Dados inválidos: ...'", async () => {
    const voluntario = seedUser({ roles: ["VOLUNTARIO"] })
    const coordenador = seedUser({ roles: ["COORDENADOR"] })

    await expect(labOperations.createLaboratorySchedule({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00" })).rejects.toThrow(
      "Usuário não tem permissão para gerenciar horários do laboratório",
    )
    await expect(labOperations.createLaboratorySchedule({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00", userId: voluntario.id! })).rejects.toThrow(
      "Usuário não tem permissão para gerenciar horários do laboratório",
    )
    await expect(labOperations.createLaboratorySchedule({ dayOfWeek: 7, startTime: "25:00", endTime: "07:00", userId: coordenador.id! })).rejects.toThrow(
      "Dados inválidos: Dia da semana inválido, Horário de início inválido",
    )
    await expect(labOperations.createLaboratorySchedule({ dayOfWeek: 1, startTime: "12:00", endTime: "12:00", userId: coordenador.id! })).rejects.toThrow(
      "Horário de início deve ser anterior ao fim",
    )

    const created = await labOperations.createLaboratorySchedule({ dayOfWeek: 2, startTime: "08:00", endTime: "12:00", notes: "manha", userId: coordenador.id! })
    expect(created).toMatchObject({ dayOfWeek: 2, startTime: "08:00", endTime: "12:00", notes: "manha" })
  })

  it("QUIRK-8L12: update ignora dayOfWeek e nunca limpa notes ('' -> undefined -> não escrito)", async () => {
    const coordenador = seedUser({ roles: ["COORDENADOR"] })
    const created = await labOperations.createLaboratorySchedule({ dayOfWeek: 2, startTime: "08:00", endTime: "12:00", notes: "manha", userId: coordenador.id! })

    const updated = await labOperations.updateLaboratorySchedule(created.id!, { dayOfWeek: 5, startTime: "09:00", notes: "", userId: coordenador.id! })
    expect(updated.dayOfWeek).toBe(2) // ignorado
    expect(updated.startTime).toBe("09:00")
    expect(updated.notes).toBe("manha") // "" -> undefined -> Prisma não escreve

    await expect(labOperations.updateLaboratorySchedule(999, { startTime: "09:00", userId: coordenador.id! })).rejects.toThrow("Horário do laboratório não encontrado")
    await expect(labOperations.updateLaboratorySchedule(created.id!, { startTime: "09:00", userId: undefined })).rejects.toThrow(
      "Usuário não tem permissão para gerenciar horários do laboratório",
    )

    await labOperations.deleteLaboratorySchedule({ scheduleId: created.id!, userId: coordenador.id! })
    await expect(labOperations.deleteLaboratorySchedule({ scheduleId: created.id!, userId: coordenador.id! })).rejects.toThrow("Horário do laboratório não encontrado")
  })

  it("list ordena dayOfWeek ASC depois startTime ASC", async () => {
    const coordenador = seedUser({ roles: ["COORDENADOR"] })
    await labOperations.createLaboratorySchedule({ dayOfWeek: 3, startTime: "14:00", endTime: "18:00", userId: coordenador.id! })
    await labOperations.createLaboratorySchedule({ dayOfWeek: 1, startTime: "14:00", endTime: "18:00", userId: coordenador.id! })
    await labOperations.createLaboratorySchedule({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00", userId: coordenador.id! })
    const list = await labOperations.listLaboratorySchedules()
    expect(list.map((s) => `${s.dayOfWeek} ${s.startTime}`)).toEqual(["1 08:00", "1 14:00", "3 14:00"])
  })
})

// ================= RESPONSIBILITIES =================

describe("responsibilities", () => {
  it("QUIRK-8L10: start exige papel de lab; ativa é GLOBAL (outro usuário não pode iniciar)", async () => {
    const voluntario = seedUser({ roles: ["VOLUNTARIO"] })
    const lab = seedUser({ roles: ["LABORATORISTA"] })

    await expect(labOperations.startResponsibility({ actorUserId: voluntario.id!, actorName: voluntario.name })).rejects.toThrow(
      "Usuário não tem permissão para iniciar responsabilidades",
    )
    await expect(labOperations.startResponsibility({ actorUserId: 999, actorName: "X" })).rejects.toThrow("Usuário não encontrado")

    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name, notes: "limpeza" })
    expect(started.userName).toBe(lab.name)
    expect(started.endTime).toBeNull()
    expect(started.pausedAt).toBeNull()
    expect(started.totalPausedMs).toBe(0)

    await expect(labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name })).rejects.toThrow(
      "Já existe uma responsabilidade ativa. Finalize a responsabilidade atual antes de iniciar uma nova.",
    )
  })

  it("canEndResponsibility: dono true; papel lab true p/ terceiros; desconhecidos false", async () => {
    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const outro = seedUser({ roles: ["VOLUNTARIO"] })
    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name })

    expect(await labOperations.canEndResponsibility(lab.id!, started.id!)).toBe(true)
    expect(await labOperations.canEndResponsibility(outro.id!, started.id!)).toBe(false)
    const coord = seedUser({ roles: ["COORDENADOR"] })
    expect(await labOperations.canEndResponsibility(coord.id!, started.id!)).toBe(true)
    expect(await labOperations.canEndResponsibility(999, started.id!)).toBe(false)
    expect(await labOperations.canEndResponsibility(outro.id!, 999)).toBe(false)
  })

  it("QUIRK-8L11: end/delete sem checagem de acesso no gateway; notes falsy preserva; já finalizada bloqueia", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"))
    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const outro = seedUser({ roles: ["VOLUNTARIO"] })
    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name, notes: "notas originais" })

    // endTime precisa ser ESTRITAMENTE depois de startTime (validacao do repositorio)
    vi.setSystemTime(new Date("2026-09-16T12:00:01.000Z"))
    const ended = await labOperations.endResponsibility(started.id!) // notes undefined => preserva
    expect(ended.endTime).toBeInstanceOf(Date)
    expect(ended.notes).toBe("notas originais")
    await expect(labOperations.endResponsibility(started.id!)).rejects.toThrow("Responsabilidade já foi finalizada")

    // delete por qualquer um (gateway não checa)
    await labOperations.deleteResponsibility(started.id!)
    await expect(labOperations.deleteResponsibility(started.id!)).rejects.toThrow("Responsabilidade não encontrada")
    void outro
  })

  it("updateResponsibilityNotes: 'Acesso negado' p/ sem permissão; notes blank => null", async () => {
    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const outro = seedUser({ roles: ["VOLUNTARIO"] })
    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name, notes: "originais" })

    await expect(labOperations.updateResponsibilityNotes(started.id!, outro.id!, "hack")).rejects.toThrow("Acesso negado")
    const updated = await labOperations.updateResponsibilityNotes(started.id!, lab.id!, "   ")
    expect(updated.notes).toBeNull()
  })

  it("QUIRK-8L15: pause no-op silencioso; resume dobra o trecho pausado em totalPausedMs", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"))

    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name })

    expect(await labOperations.pauseResponsibilityForUser(999)).toBeNull() // sem ativa
    const paused = await labOperations.pauseResponsibilityForUser(lab.id!)
    expect(paused?.pausedAt).toBeInstanceOf(Date)
    expect((paused as any).isPaused).toBe(true)

    vi.setSystemTime(new Date("2026-09-16T12:00:05.000Z"))
    const pausedAgain = await labOperations.pauseResponsibilityForUser(lab.id!) // no-op (já pausada)
    expect(pausedAgain?.pausedAt).toBeInstanceOf(Date)

    const resumed = await labOperations.resumeResponsibilityForUser(lab.id!)
    expect(resumed?.pausedAt).toBeNull()
    expect(resumed?.totalPausedMs).toBe(5000)
    expect(await labOperations.resumeResponsibilityForUser(lab.id!)).toBeNull() // não pausada

    const row = fake.world.responsibilities[0]
    expect(row.pausedAt).toBeNull()
    expect(row.totalPausedMs).toBe(5000)
    expect(row.startTime).toBe("2026-09-16T12:00:00.000Z") // String ISO no banco
  })

  it("listResponsibilities: shapes por query + overlap de range", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"))
    const lab = seedUser({ roles: ["LABORATORISTA"] })
    const started = await labOperations.startResponsibility({ actorUserId: lab.id!, actorName: lab.name })

    const activeOnly = await labOperations.listResponsibilities({ activeOnly: true })
    expect(activeOnly.activeResponsibility?.id!).toBe(started.id!)
    expect(activeOnly.responsibilities).toBeUndefined()

    const all = await labOperations.listResponsibilities()
    expect(all.responsibilities).toHaveLength(1)

    const ranged = await labOperations.listResponsibilities({
      startDate: new Date("2026-09-20T00:00:00.000Z"),
      endDate: new Date("2026-09-21T00:00:00.000Z"),
    })
    expect(ranged.responsibilities).toHaveLength(1) // ativa (endTime null) entra em qualquer range

    const rangedOut = await labOperations.listResponsibilities({
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-02T00:00:00.000Z"),
    })
    expect(rangedOut.responsibilities).toHaveLength(0) // startTime depois do range
  })
})

// ================= USER SCHEDULES =================

describe("user schedules", () => {
  const MANAGER = ["COORDENADOR"]

  it("QUIRK-8L14: leitura aberta; escrita exige MANAGE_USERS", async () => {
    const target = seedUser()
    const voluntario = seedUser({ roles: ["VOLUNTARIO"] })
    const coordenador = seedUser({ roles: ["COORDENADOR"] })

    const created = await labOperations.createUserSchedule({
      actorUserId: coordenador.id!,
      actorRoles: coordenador.roles,
      targetUserId: target.id!,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "12:00",
    })
    expect(created).toMatchObject({ userId: target.id!, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" })

    // leitura por voluntario: tudo / filtrado por alvo
    const all = await labOperations.listUserSchedules({ actorUserId: voluntario.id!, actorRoles: voluntario.roles })
    expect(all).toHaveLength(1)
    const mine = await labOperations.listUserSchedules({ actorUserId: voluntario.id!, actorRoles: voluntario.roles, targetUserId: target.id! })
    expect(mine).toHaveLength(1)

    await expect(
      labOperations.createUserSchedule({ actorUserId: voluntario.id!, actorRoles: voluntario.roles, targetUserId: target.id!, dayOfWeek: 2, startTime: "08:00", endTime: "12:00" }),
    ).rejects.toThrow("Acesso negado")
    await expect(labOperations.deleteUserSchedule({ actorUserId: voluntario.id!, actorRoles: voluntario.roles, scheduleId: created.id! })).rejects.toThrow("Acesso negado")
    await expect(labOperations.getUserSchedule(created.id!)).toBeTruthy()
  })

  it("validações do repositório; usuário alvo inexistente", async () => {
    const coordenador = seedUser({ roles: ["COORDENADOR"] })
    await expect(
      labOperations.createUserSchedule({ actorUserId: coordenador.id!, actorRoles: coordenador.roles, targetUserId: 999, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" }),
    ).rejects.toThrow("Usuário não encontrado")
    await expect(
      labOperations.createUserSchedule({ actorUserId: coordenador.id!, actorRoles: coordenador.roles, targetUserId: 1, dayOfWeek: 7, startTime: "12:00", endTime: "08:00" }),
    ).rejects.toThrow("Dados inválidos: Dia da semana inválido, Horário de início deve ser anterior ao fim")
  })

  it("QUIRK-8L13: updateUserSchedule ignora dayOfWeek; replace bypassa validação (slots inválidos são escritos)", async () => {
    const target = seedUser()
    const coordenador = seedUser({ roles: ["COORDENADOR"] })
    const created = await labOperations.createUserSchedule({
      actorUserId: coordenador.id!,
      actorRoles: coordenador.roles,
      targetUserId: target.id!,
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "12:00",
    })

    const updated = await labOperations.updateUserSchedule({
      actorUserId: coordenador.id!,
      actorRoles: coordenador.roles,
      scheduleId: created.id!,
      dayOfWeek: 5,
      endTime: "18:00",
    })
    expect(updated.dayOfWeek).toBe(1) // ignorado
    expect(updated.endTime).toBe("18:00")
    await expect(labOperations.updateUserSchedule({ actorUserId: coordenador.id!, actorRoles: coordenador.roles, scheduleId: 999, endTime: "18:00" })).rejects.toThrow("Horário não encontrado")

    // replace com slots INVALIDOS (dayOfWeek 9, hora 99:99) — createMany escreve cru
    const replaced = await labOperations.replaceUserSchedules({
      actorUserId: coordenador.id!,
      actorRoles: coordenador.roles,
      targetUserId: target.id!,
      slots: [
        { dayOfWeek: 9, startTime: "99:99", endTime: "00:00" },
        { dayOfWeek: 3, startTime: "08:00", endTime: "12:00" },
      ],
    })
    expect(replaced).toHaveLength(2)
    expect(replaced[0]).toMatchObject({ dayOfWeek: 3, startTime: "08:00" })
    expect(replaced[1]).toMatchObject({ dayOfWeek: 9, startTime: "99:99" })
    expect(fake.world.userSchedules).toHaveLength(2) // a original foi substituida
  })
})
