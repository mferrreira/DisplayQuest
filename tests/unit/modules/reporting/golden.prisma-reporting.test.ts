/**
 * OND7-B1 — GOLDEN do PrismaReportingGateway (PLAN ONDA 7 batch 7.1: "Golden do
 * prisma-reporting.gateway.ts: weekly reports, project reports, agregacao de horas
 * por periodo").
 *
 * Congela o comportamento OBSERVÁVEL das 22 operações do gateway (1016 linhas) sobre
 * fake prisma (vi.hoisted) + seam de storage (vi.mock("@/lib/storage/report-uploads"))
 * + notificationsModule fake injetado no construtor.
 *
 * QUIRK-7A (pinado): getProjectHours só aplica filtro de tempo quando AMBOS
 * weekStart e weekEnd são fornecidos (`(weekStart && weekEnd)`); range parcial é
 * ignorado e TODAS as sessões do projeto entram.
 * QUIRK-7B (pinado): listWeeklyHoursHistory com weekStart usa janela
 * [startOfWeek, endOfWeek) — `lt` exclui linha exatamente no instante
 * endOfWeek (domingo 23:59:59.999 local) — e ordena por totalHours desc (não data).
 * QUIRK-7C (pinado): resetWeeklyHoursHistory NÃO deduplica (repetição cria linhas
 * duplicadas em weekly_hours_history) e zera currentWeekHours de TODO usuário ativo
 * (mesmo com 0h); savedHours é string toFixed(1). createWeeklyHoursHistory deduplica
 * por (userId, weekStart exato) e devolve totalHours numérico.
 * QUIRK-7D (pinado): aggregateProjectReport NÃO filtra status de work_sessions —
 * sessões active/paused entram na janela e nos totals.
 * QUIRK-7E (pinado): read model de relatório weekly usa label date-fns LOCAL
 * `Semana dd/MM–dd/MM` (buildProjectReportReadModel), enquanto a notificação usa o
 * label SP-anchored de computePeriod `Semana de dd/MM a dd/MM`.
 * QUIRK-7F (pinado): createProjectReport exige conteúdo não-vazio;
 * updateProjectReport NÃO valida conteúdo (string vazia é aceita).
 * QUIRK-7G (pinado): deleteProjectReport é exclusivo de MANAGE_USERS
 * (COORDENADOR/GERENTE) — o autor NÃO pode excluir o próprio relatório.
 * QUIRK-7H (pinado): ProjectHoursResult.hoursByUser[].sessions vaza as linhas cruas
 * do Prisma (com relações user/project/dailyLog/tasks) no read model.
 * QUIRK-7I (pinado): upsertWeeklyReport normaliza weekStart/weekEnd com setHours do
 * fuso LOCAL do servidor (não SP-anchored) e casa "existing" por igualdade EXATA de
 * instantes normalizados.
 * QUIRK-7J (pinado): listProjectReports — líder SEM projetos liderados lança
 * "Acesso negado" mesmo sem filtro projectId; membership em projeto NÃO dá acesso a
 * relatórios (só MANAGE_USERS ou leaderId).
 * QUIRK-7K (pinado): deleteWeeklyReport de id inexistente propaga P2025 do Prisma.
 * QUIRK-7L (pinado): getProjectWeeklyHours NÃO normaliza weekStart para Monday — a
 * janela começa no instante bruto informado.
 * QUIRK-7M (pinado): listProjectReports com from E to colidem na mesma chave
 * `periodStart` do spread do where — o `to` (lte) sobrescreve o `from` (gte), que é
 * descartado.
 *
 * TZ-robustez: caminhos date-fns (startOfWeek/endOfWeek/subWeeks/setHours/format)
 * são locais por natureza; as asserções recomputam os esperados com as MESMAS
 * funções sobre os mesmos instantes (pina a fórmula, não o fuso da máquina).
 * computePeriod é SP-anchored puro → asserções por ISO fixo.
 */
import { endOfWeek, format, startOfWeek, subWeeks } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const world = {
    users: [] as any[],
    projects: [] as any[],
    projectMembers: [] as any[],
    tasks: [] as any[],
    workSessions: [] as any[],
    dailyLogs: [] as any[],
    weeklyReports: [] as any[],
    weeklyHours: [] as any[],
    projectReports: [] as any[],
    reportAttachments: [] as any[],
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
    storage: { removed: [] as string[], sweepCalls: [] as Array<{ paths: string[]; maxAgeMs?: number }>, sweepResult: 0 },
  };

  const clone = (v: any) => (v == null ? v : structuredClone(v));

  const notFound = (model: string, id: unknown) => {
    const err = new Error(`Record not found: ${model} ${String(id)}`);
    (err as any).code = "P2025";
    return err;
  };

  const pick = (row: any, select: any) => {
    if (row == null) return null;
    if (!select) return clone(row);
    const out: any = {};
    for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
    return out;
  };

  const okDate = (d: Date | null, cond: any): boolean => {
    if (!cond) return true;
    if (d == null) return false;
    const t = d.getTime();
    if (cond.gte !== undefined && !(t >= cond.gte.getTime())) return false;
    if (cond.lte !== undefined && !(t <= cond.lte.getTime())) return false;
    if (cond.lt !== undefined && !(t < cond.lt.getTime())) return false;
    if (cond.gt !== undefined && !(t > cond.gt.getTime())) return false;
    return true;
  };

  const sameDate = (a: Date, b: Date) => a.getTime() === b.getTime();

  const withSessionInclude = (s: any, include: any) => {
    if (!include) return clone(s);
    const row: any = { ...s };
    if (include.user) {
      row.user = pick(world.users.find((u) => u.id === s.userId) ?? null, include.user.select ?? null);
    }
    if (include.project) {
      const p = world.projects.find((pr) => pr.id === s.projectId) ?? null;
      row.project = p ? pick(p, include.project.select ?? null) : null;
    }
    if (include.dailyLog) {
      const dl = world.dailyLogs.find((l) => l.workSessionId === s.id) ?? null;
      row.dailyLog = dl ? pick(dl, include.dailyLog.select ?? null) : null;
    }
    if (include.tasks) {
      row.tasks = (s.tasks ?? []).map((st: any) => {
        const task = world.tasks.find((t) => t.id === st.taskId) ?? null;
        return { ...clone(st), task: task ? pick(task, include.tasks.include?.task?.select ?? null) : null };
      });
    }
    return row;
  };

  const prisma: any = {
    users: {
      async findUnique({ where, select }: any) {
        const row = world.users.find((u) => u.id === where.id);
        return row ? pick(row, select) : null;
      },
      async findMany({ where, select }: any) {
        let rows = [...world.users];
        if (where?.status !== undefined) rows = rows.filter((u) => u.status === where.status);
        if (where?.roles?.hasSome !== undefined) {
          rows = rows.filter((u) => (u.roles ?? []).some((r: string) => where.roles.hasSome.includes(r)));
        }
        if (where?.NOT?.id !== undefined) rows = rows.filter((u) => u.id !== where.NOT.id);
        return rows.map((r) => pick(r, select));
      },
      async update({ where, data }: any) {
        const row = world.users.find((u) => u.id === where.id);
        if (!row) throw notFound("users", where.id);
        for (const [k, v] of Object.entries(data as any)) row[k] = v;
        return clone(row);
      },
    },
    projects: {
      async findUnique({ where, select }: any) {
        const row = world.projects.find((p) => p.id === where.id);
        return row ? pick(row, select) : null;
      },
      async findFirst({ where, select }: any) {
        const row = world.projects.find(
          (p) =>
            (where.id === undefined || p.id === where.id) &&
            (where.leaderId === undefined || p.leaderId === where.leaderId),
        );
        return row ? pick(row, select) : null;
      },
      async findMany({ where, include }: any) {
        let base = [...world.projects];
        if (where?.leaderId !== undefined) base = base.filter((p) => p.leaderId === where.leaderId);
        if (where?.id !== undefined) base = base.filter((p) => p.id === where.id);
        return base.map((p) => {
          const row: any = clone(p);
          if (include?.members) {
            row.members = world.projectMembers
              .filter((m) => m.projectId === p.id)
              .map((m) => {
                const mm: any = clone(m);
                if (include.members.include?.user) {
                  mm.user = pick(world.users.find((u) => u.id === m.userId) ?? null, include.members.include.user.select ?? null);
                }
                return mm;
              });
          }
          return row;
        });
      },
    },
    project_members: {
      async findMany({ where, include }: any) {
        let rows = [...world.projectMembers];
        if (where?.userId !== undefined) rows = rows.filter((m) => m.userId === where.userId);
        if (where?.projectId !== undefined) rows = rows.filter((m) => m.projectId === where.projectId);
        return rows.map((m) => {
          const row: any = clone(m);
          if (include?.project) {
            row.project = clone(world.projects.find((p) => p.id === m.projectId) ?? null);
          }
          return row;
        });
      },
    },
    weekly_reports: {
      async findMany({ where }: any) {
        let rows = [...world.weeklyReports];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        rows = rows.filter((r) => okDate(r.weekStart, where?.weekStart));
        rows = rows.filter((r) => okDate(r.weekEnd, where?.weekEnd));
        rows.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
        return rows.map(clone);
      },
      async findUnique({ where }: any) {
        const row = world.weeklyReports.find((r) => r.id === where.id);
        return row ? clone(row) : null;
      },
      async findFirst({ where, select }: any) {
        const row = world.weeklyReports.find(
          (r) =>
            r.userId === where.userId &&
            sameDate(r.weekStart, where.weekStart) &&
            sameDate(r.weekEnd, where.weekEnd),
        );
        return row ? pick(row, select) : null;
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
        };
        world.weeklyReports.push(row);
        return clone(row);
      },
      async update({ where, data }: any) {
        const row = world.weeklyReports.find((r) => r.id === where.id);
        if (!row) throw notFound("weekly_reports", where.id);
        for (const k of ["userName", "totalLogs", "summary"]) {
          if (data[k] !== undefined) row[k] = data[k];
        }
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = world.weeklyReports.findIndex((r) => r.id === where.id);
        if (idx === -1) throw notFound("weekly_reports", where.id);
        world.weeklyReports.splice(idx, 1);
      },
    },
    work_sessions: {
      async count({ where }: any) {
        let rows = [...world.workSessions];
        if (where?.status !== undefined) rows = rows.filter((s) => s.status === where.status);
        if (where?.userId !== undefined) rows = rows.filter((s) => s.userId === where.userId);
        if (where?.projectId !== undefined) rows = rows.filter((s) => s.projectId === where.projectId);
        rows = rows.filter((s) => okDate(s.startTime, where?.startTime));
        return rows.length;
      },
      async findMany({ where, include, select }: any) {
        let rows = [...world.workSessions];
        if (where?.status !== undefined) rows = rows.filter((s) => s.status === where.status);
        if (where?.userId !== undefined) rows = rows.filter((s) => s.userId === where.userId);
        if (where?.projectId !== undefined) rows = rows.filter((s) => s.projectId === where.projectId);
        rows = rows.filter((s) => okDate(s.startTime, where?.startTime));
        rows.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
        if (select) return rows.map((r) => pick(r, select));
        return rows.map((r) => withSessionInclude(r, include));
      },
    },
    daily_logs: {
      async findMany({ where, include }: any) {
        let rows = [...world.dailyLogs];
        if (where?.projectId !== undefined) rows = rows.filter((l) => l.projectId === where.projectId);
        if (where?.userId !== undefined) rows = rows.filter((l) => l.userId === where.userId);
        rows = rows.filter((l) => okDate(l.date, where?.date));
        rows.sort((a, b) => b.date.getTime() - a.date.getTime());
        return rows.map((l) => {
          const row: any = clone(l);
          if (include?.user) row.user = pick(world.users.find((u) => u.id === l.userId) ?? null, include.user.select ?? null);
          if (include?.project) {
            const p = world.projects.find((pr) => pr.id === l.projectId) ?? null;
            row.project = p ? pick(p, include.project.select ?? null) : null;
          }
          if (include?.workSession) {
            const ws = world.workSessions.find((s) => s.id === l.workSessionId) ?? null;
            row.workSession = ws ? pick(ws, include.workSession.select ?? null) : null;
          }
          return row;
        });
      },
    },
    weekly_hours_history: {
      async findMany({ where, orderBy, include }: any) {
        let rows = [...world.weeklyHours];
        if (where?.userId !== undefined) rows = rows.filter((r) => r.userId === where.userId);
        rows = rows.filter((r) => okDate(r.weekStart, where?.weekStart));
        if (orderBy?.totalHours === "desc") {
          rows.sort((a, b) => b.totalHours - a.totalHours);
        } else {
          rows.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
        }
        return rows.map((r) => {
          const row: any = clone(r);
          if (include?.user) {
            row.user = pick(world.users.find((u) => u.id === r.userId) ?? null, include.user.select ?? null);
          }
          return row;
        });
      },
      async findFirst({ where }: any) {
        const row = world.weeklyHours.find(
          (r) =>
            (where?.userId === undefined || r.userId === where.userId) &&
            (where?.weekStart === undefined || sameDate(r.weekStart, where.weekStart)),
        );
        return row ? clone(row) : null;
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
        };
        world.weeklyHours.push(row);
        return clone(row);
      },
    },
    project_reports: {
      async findUnique({ where, include, select }: any) {
        let row: any;
        if (where.id !== undefined) {
          row = world.projectReports.find((r) => r.id === where.id);
        } else {
          const c = where.projectId_periodType_periodStart_authorId;
          row = world.projectReports.find(
            (r) =>
              r.projectId === c.projectId &&
              r.periodType === c.periodType &&
              sameDate(r.periodStart, c.periodStart) &&
              r.authorId === c.authorId,
          );
        }
        if (!row) return null;
        if (select) return pick(row, select);
        const out: any = clone(row);
        if (include?.project) out.project = pick(world.projects.find((p) => p.id === row.projectId) ?? null, include.project.select ?? null);
        if (include?.author) out.author = pick(world.users.find((u) => u.id === row.authorId) ?? null, include.author.select ?? null);
        if (include?.attachments) {
          out.attachments = world.reportAttachments
            .filter((a) => a.reportId === row.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(clone);
        }
        return out;
      },
      async findMany({ where, select }: any) {
        let rows = [...world.projectReports];
        if (where?.projectId?.in !== undefined) rows = rows.filter((r) => where.projectId.in.includes(r.projectId));
        else if (where?.projectId !== undefined) rows = rows.filter((r) => r.projectId === where.projectId);
        if (where?.periodType !== undefined) rows = rows.filter((r) => r.periodType === where.periodType);
        if (where?.authorId !== undefined) rows = rows.filter((r) => r.authorId === where.authorId);
        rows = rows.filter((r) => okDate(r.periodStart, where?.periodStart));
        rows.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
        return rows.map((r) => pick(r, select));
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
        };
        world.projectReports.push(row);
        return clone(row);
      },
      async update({ where, data }: any) {
        const row = world.projectReports.find((r) => r.id === where.id);
        if (!row) throw notFound("project_reports", where.id);
        for (const k of ["title", "content", "periodStart", "periodEnd", "periodType"]) {
          if (data[k] !== undefined) row[k] = data[k];
        }
        row.updatedAt = new Date();
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = world.projectReports.findIndex((r) => r.id === where.id);
        if (idx === -1) throw notFound("project_reports", where.id);
        world.projectReports.splice(idx, 1);
        // cascade do schema: report_attachments onDelete: Cascade
        for (let i = world.reportAttachments.length - 1; i >= 0; i--) {
          if (world.reportAttachments[i].reportId === where.id) world.reportAttachments.splice(i, 1);
        }
      },
    },
    report_attachments: {
      async findMany({ where, select }: any) {
        let rows = [...world.reportAttachments];
        if (where?.reportId !== undefined) rows = rows.filter((a) => a.reportId === where.reportId);
        return rows.map((r) => pick(r, select));
      },
      async findUnique({ where }: any) {
        const row = world.reportAttachments.find((a) => a.id === where.id);
        return row ? clone(row) : null;
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
        };
        world.reportAttachments.push(row);
        return clone(row);
      },
      async delete({ where }: any) {
        const idx = world.reportAttachments.findIndex((a) => a.id === where.id);
        if (idx === -1) throw notFound("report_attachments", where.id);
        world.reportAttachments.splice(idx, 1);
      },
    },
  };

  const removeStoredReportFile = vi.fn(async (storedPath: string) => {
    world.storage.removed.push(storedPath);
  });
  const sweepStaleReportUploads = vi.fn(async (referenced: string[], maxAgeMs?: number) => {
    world.storage.sweepCalls.push({ paths: referenced, maxAgeMs });
    return world.storage.sweepResult;
  });

  const reset = () => {
    world.users = [];
    world.projects = [];
    world.projectMembers = [];
    world.tasks = [];
    world.workSessions = [];
    world.dailyLogs = [];
    world.weeklyReports = [];
    world.weeklyHours = [];
    world.projectReports = [];
    world.reportAttachments = [];
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
    };
    world.storage.removed = [];
    world.storage.sweepCalls = [];
    world.storage.sweepResult = 0;
    removeStoredReportFile.mockClear();
    sweepStaleReportUploads.mockClear();
  };

  return { world, prisma, removeStoredReportFile, sweepStaleReportUploads, reset };
});

vi.mock("@/lib/database/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/storage/report-uploads", () => ({
  removeStoredReportFile: h.removeStoredReportFile,
  sweepStaleReportUploads: h.sweepStaleReportUploads,
}));

import { PrismaReportingGateway } from "@/backend/modules/reporting/infrastructure/prisma-reporting.gateway";

const FROZEN = new Date("2026-09-16T12:00:00.000Z"); // quarta-feira
const W = { weekStartsOn: 1 } as const;

function seedUser(over: any = {}) {
  const u = {
    id: h.world.seq.user++,
    name: over.name ?? `Usuario ${over.id ?? 0}`,
    email: over.email ?? `u${over.id ?? 0}@example.com`,
    roles: over.roles ?? ["VOLUNTARIO"],
    status: over.status ?? "active",
    currentWeekHours: over.currentWeekHours ?? 0,
    ...("id" in over ? { id: over.id } : {}),
  };
  h.world.users.push(u);
  return u;
}

function seedProject(over: any = {}) {
  const p = {
    id: "id" in over ? over.id : h.world.seq.project++,
    name: over.name ?? "Projeto",
    description: over.description ?? null,
    createdAt: over.createdAt ?? "2026-01-01T00:00:00.000Z",
    createdBy: over.createdBy ?? 1,
    leaderId: over.leaderId ?? null,
    status: over.status ?? "active",
    links: null,
  };
  h.world.projects.push(p);
  return p;
}

function seedMember(projectId: number, userId: number, roles: string[] = ["COLABORADOR"]) {
  const m = {
    id: h.world.seq.member++,
    projectId,
    userId,
    joinedAt: new Date("2026-01-02T00:00:00.000Z"),
    roles,
  };
  h.world.projectMembers.push(m);
  return m;
}

function seedTask(over: any = {}) {
  const t = {
    id: "id" in over ? over.id : h.world.seq.task++,
    title: over.title ?? "Task",
    description: null,
    status: over.status ?? "pending",
    priority: "medium",
    assignedTo: null,
    projectId: over.projectId ?? null,
    dueDate: null,
    points: over.points ?? 10,
    completed: over.completed ?? false,
  };
  h.world.tasks.push(t);
  return t;
}

function seedSession(over: any = {}) {
  const s = {
    id: "id" in over ? over.id : h.world.seq.session++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    startTime: over.startTime instanceof Date ? over.startTime : new Date(over.startTime),
    endTime: over.endTime == null ? null : over.endTime instanceof Date ? over.endTime : new Date(over.endTime),
    duration: over.duration ?? null,
    activity: over.activity ?? null,
    location: over.location ?? null,
    projectId: over.projectId ?? null,
    status: over.status ?? "completed",
    createdAt: over.createdAt instanceof Date ? over.createdAt : new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    tasks: (over.tasks ?? []).map((taskId: number) => ({ id: taskId, workSessionId: over.id, taskId })),
  };
  h.world.workSessions.push(s);
  return s;
}

function seedDailyLog(over: any = {}) {
  const l = {
    id: "id" in over ? over.id : h.world.seq.dailyLog++,
    userId: over.userId,
    projectId: over.projectId ?? null,
    date: over.date instanceof Date ? over.date : new Date(over.date),
    note: over.note ?? null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    workSessionId: over.workSessionId ?? null,
  };
  h.world.dailyLogs.push(l);
  return l;
}

function seedWeeklyReport(over: any = {}) {
  const r = {
    id: "id" in over ? over.id : h.world.seq.weeklyReport++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    weekStart: over.weekStart instanceof Date ? over.weekStart : new Date(over.weekStart),
    weekEnd: over.weekEnd instanceof Date ? over.weekEnd : new Date(over.weekEnd),
    totalLogs: over.totalLogs ?? 0,
    summary: over.summary ?? null,
    createdAt: over.createdAt instanceof Date ? over.createdAt : new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  };
  h.world.weeklyReports.push(r);
  return r;
}

function seedWeeklyHours(over: any = {}) {
  const r = {
    id: "id" in over ? over.id : h.world.seq.weeklyHours++,
    userId: over.userId,
    userName: over.userName ?? `Usuario ${over.userId}`,
    weekStart: over.weekStart instanceof Date ? over.weekStart : new Date(over.weekStart),
    weekEnd: over.weekEnd instanceof Date ? over.weekEnd : new Date(over.weekEnd),
    totalHours: over.totalHours ?? 0,
    createdAt: over.createdAt instanceof Date ? over.createdAt : new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  };
  h.world.weeklyHours.push(r);
  return r;
}

function seedProjectReport(over: any = {}) {
  const r = {
    id: "id" in over ? over.id : h.world.seq.projectReport++,
    projectId: over.projectId,
    authorId: over.authorId,
    periodType: over.periodType ?? "monthly",
    periodStart: over.periodStart === undefined ? new Date("2026-09-01T03:00:00.000Z") : over.periodStart instanceof Date ? over.periodStart : new Date(over.periodStart),
    periodEnd: over.periodEnd === undefined ? new Date("2026-10-01T02:59:59.999Z") : over.periodEnd instanceof Date ? over.periodEnd : new Date(over.periodEnd),
    title: over.title ?? null,
    content: over.content ?? "conteudo",
    createdAt: over.createdAt instanceof Date ? over.createdAt : new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
    updatedAt: over.updatedAt instanceof Date ? over.updatedAt : new Date(over.updatedAt ?? "2026-09-01T00:00:00.000Z"),
  };
  h.world.projectReports.push(r);
  return r;
}

function seedAttachment(over: any = {}) {
  const a = {
    id: "id" in over ? over.id : h.world.seq.attachment++,
    reportId: over.reportId,
    fileName: over.fileName ?? "arquivo.pdf",
    storedPath: over.storedPath ?? `reports/${over.reportId}/arquivo.pdf`,
    mimeType: over.mimeType ?? "application/pdf",
    sizeBytes: over.sizeBytes ?? 1234,
    uploadedBy: over.uploadedBy ?? over.authorId ?? 1,
    createdAt: over.createdAt instanceof Date ? over.createdAt : new Date(over.createdAt ?? "2026-09-01T00:00:00.000Z"),
  };
  h.world.reportAttachments.push(a);
  return a;
}

let gateway: PrismaReportingGateway;
let notifications: { publishEvent: ReturnType<typeof vi.fn> };

beforeEach(() => {
  h.reset();
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
  notifications = { publishEvent: vi.fn(async () => undefined) };
  gateway = new PrismaReportingGateway(notifications as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OND7-B1 golden — PrismaReportingGateway", () => {
  // ================= listWeeklyReports =================
  describe("listWeeklyReports", () => {
    it("filtra por userId e ordena por weekStart desc", async () => {
      seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      seedWeeklyReport({ userId: 1, weekStart: "2026-08-31T00:00:00.000Z", weekEnd: "2026-09-06T23:59:59.999Z" });
      seedWeeklyReport({ userId: 2, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });

      const out = await gateway.listWeeklyReports({ userId: 1 });
      expect(out.map((r) => r.userId)).toEqual([1, 1]);
      expect(out.map((r) => r.weekStart)).toEqual(["2026-09-07T00:00:00.000Z", "2026-08-31T00:00:00.000Z"]);
    });

    it("filtra por weekStart gte / weekEnd lte", async () => {
      seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      seedWeeklyReport({ userId: 1, weekStart: "2026-08-31T00:00:00.000Z", weekEnd: "2026-09-06T23:59:59.999Z" });

      const out = await gateway.listWeeklyReports({ weekStart: "2026-09-01T00:00:00.000Z" });
      expect(out).toHaveLength(1);
      expect(out[0].weekStart).toBe("2026-09-07T00:00:00.000Z");
    });

    it("totalLogs = count de work_sessions completed na janela do relatório (status e janela respeitados)", async () => {
      const rep = seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      seedSession({ userId: 1, startTime: "2026-09-08T10:00:00.000Z", status: "completed" });
      seedSession({ userId: 1, startTime: "2026-09-09T10:00:00.000Z", status: "completed" });
      seedSession({ userId: 1, startTime: "2026-09-10T10:00:00.000Z", status: "active" });
      seedSession({ userId: 1, startTime: "2026-09-14T10:00:00.000Z", status: "completed" }); // fora da janela
      seedSession({ userId: 2, startTime: "2026-09-08T10:00:00.000Z", status: "completed" }); // outro usuário

      const out = await gateway.listWeeklyReports({});
      expect(out[0].id).toBe(rep.id);
      expect(out[0].totalLogs).toBe(2);
    });

    it("read model: ISO strings, summary null passthrough", async () => {
      seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", summary: null });
      const out = await gateway.listWeeklyReports({ userId: 1 });
      expect(out[0]).toEqual({
        id: expect.any(Number),
        userId: 1,
        userName: "Usuario 1",
        weekStart: "2026-09-07T00:00:00.000Z",
        weekEnd: "2026-09-13T23:59:59.999Z",
        totalLogs: 0,
        summary: null,
        createdAt: "2026-09-01T00:00:00.000Z",
      });
      expect(out[0].logs).toBeUndefined();
    });
  });

  // ================= getWeeklyReportById =================
  describe("getWeeklyReportById", () => {
    it("retorna null para id inexistente", async () => {
      expect(await gateway.getWeeklyReportById(999)).toBeNull();
    });

    it("logs mapeados: date = endTime||startTime; nota dailyLog > activity > fallback; project null sem projeto", async () => {
      const rep = seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      const proj = seedProject({ name: "Projeto Alpha" });
      const s1 = seedSession({
        userId: 1, startTime: "2026-09-08T10:00:00.000Z", endTime: "2026-09-08T12:00:00.000Z",
        duration: 7200, projectId: proj.id, activity: "Ensaio",
      });
      seedDailyLog({ userId: 1, projectId: proj.id, date: "2026-09-08T12:00:00.000Z", note: "Nota do log", workSessionId: s1.id });
      seedSession({ userId: 1, startTime: "2026-09-09T10:00:00.000Z", endTime: "2026-09-09T11:00:00.000Z", duration: 3600, activity: "Atividade X" });
      seedSession({ userId: 1, startTime: "2026-09-10T10:00:00.000Z", endTime: "2026-09-10T11:00:00.000Z", duration: 3600 });
      seedSession({ userId: 1, startTime: "2026-09-14T10:00:00.000Z", status: "active" }); // fora da janela/status

      const out = await gateway.getWeeklyReportById(rep.id);
      expect(out).not.toBeNull();
      expect(out!.totalLogs).toBe(3);
      expect(out!.logs).toHaveLength(3);
      // orderBy startTime desc
      expect(out!.logs!.map((l) => l.id)).toEqual([expect.any(Number), expect.any(Number), expect.any(Number)]);
      const byDate = [...out!.logs!].sort((a, b) => a.startTime.localeCompare(b.startTime));
      expect(byDate[0].date).toBe("2026-09-08T12:00:00.000Z"); // endTime
      expect(byDate[0].note).toBe("Nota do log");
      expect(byDate[0].project).toEqual({ id: proj.id, name: "Projeto Alpha" });
      expect(byDate[1].note).toBe("Atividade X");
      expect(byDate[1].project).toBeNull();
      expect(byDate[2].note).toBe("Sessão finalizada sem observações");
    });

    it("log sem endTime usa startTime como date", async () => {
      const rep = seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      seedSession({ userId: 1, startTime: "2026-09-08T10:00:00.000Z", endTime: null });
      const out = await gateway.getWeeklyReportById(rep.id);
      expect(out!.logs![0].date).toBe("2026-09-08T10:00:00.000Z");
      expect(out!.logs![0].endTime).toBeNull();
    });
  });

  // ================= upsertWeeklyReport =================
  describe("upsertWeeklyReport", () => {
    it("lança 'Usuário não encontrado' para userId inexistente", async () => {
      await expect(
        gateway.upsertWeeklyReport({ userId: 999, weekStart: "2026-09-14T18:00:00.000Z", weekEnd: "2026-09-20T18:00:00.000Z" }),
      ).rejects.toThrow("Usuário não encontrado");
    });

    it("cria relatório com datas normalizadas por setHours LOCAL (QUIRK-7I) e totalLogs das completed", async () => {
      seedUser({ id: 1, name: "Maria" });
      const ws = new Date("2026-09-14T18:00:00.000Z");
      ws.setHours(0, 0, 0, 0);
      const we = new Date("2026-09-20T18:00:00.000Z");
      we.setHours(23, 59, 59, 999);
      seedSession({ userId: 1, startTime: "2026-09-15T10:00:00.000Z", status: "completed" });
      seedSession({ userId: 1, startTime: "2026-09-15T14:00:00.000Z", status: "completed" });
      seedSession({ userId: 1, startTime: "2026-09-13T12:00:00.000Z", status: "completed" }); // antes da janela
      seedSession({ userId: 1, startTime: "2026-09-16T10:00:00.000Z", status: "active" });

      const out = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
      });

      expect(out.userName).toBe("Maria");
      expect(out.weekStart).toBe(ws.toISOString());
      expect(out.weekEnd).toBe(we.toISOString());
      expect(out.totalLogs).toBe(2);
      expect(h.world.weeklyReports).toHaveLength(1);
      expect(h.world.weeklyReports[0].weekStart.getTime()).toBe(ws.getTime());
      expect(h.world.weeklyReports[0].weekEnd.getTime()).toBe(we.getTime());
    });

    it("summary automático: contagem de sessões/dias/projetos/tasks (strings exatas)", async () => {
      seedUser({ id: 1 });
      const proj = seedProject({ name: "Alpha" });
      seedTask({ id: 50, projectId: proj.id });
      seedSession({ userId: 1, startTime: "2026-09-15T10:00:00.000Z", projectId: proj.id, tasks: [50] });
      seedSession({ userId: 1, startTime: "2026-09-15T14:00:00.000Z", projectId: proj.id });

      const out = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
      });
      expect(out.summary).toBe(
        "Relatório semanal: 2 sessões concluídas em 1 dia(s). Projetos envolvidos: 1. Tasks vinculadas às sessões: 1.",
      );
    });

    it("summary automático sem sessões: frase fixa", async () => {
      seedUser({ id: 1 });
      const out = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
      });
      expect(out.summary).toBe("Nenhuma sessão concluída para este período.");
    });

    it("summary explícito é trimado; whitespace-only cai no automático", async () => {
      seedUser({ id: 1 });
      const withText = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
        summary: "  Resumo do usuário  ",
      });
      expect(withText.summary).toBe("Resumo do usuário");

      const whitespace = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
        summary: "   ",
      });
      expect(whitespace.summary).toBe("Nenhuma sessão concluída para este período.");
    });

    it("update path: mesma janela normalizada casa existing por igualdade EXATA e atualiza sem duplicar", async () => {
      seedUser({ id: 1, name: "Maria" });
      const first = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
        summary: "v1",
      });
      const second = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
        summary: "v2",
      });
      expect(second.id).toBe(first.id);
      expect(second.summary).toBe("v2");
      expect(h.world.weeklyReports).toHaveLength(1);

      // QUIRK-7I: instantes brutos diferentes no MESMO dia local colapsam na mesma
      // janela normalizada -> casa a mesma linha (não duplica)
      const third = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T19:00:00.000Z",
        summary: "v3",
      });
      expect(third.id).toBe(first.id);
      expect(h.world.weeklyReports).toHaveLength(1);

      // dias locais diferentes -> linha nova
      const fourth = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-21T12:00:00.000Z",
        weekEnd: "2026-09-27T12:00:00.000Z",
        summary: "v4",
      });
      expect(fourth.id).not.toBe(first.id);
      expect(h.world.weeklyReports).toHaveLength(2);
    });

    it("read model retornado inclui logs do período", async () => {
      seedUser({ id: 1 });
      seedSession({ userId: 1, startTime: "2026-09-15T10:00:00.000Z" });
      const out = await gateway.upsertWeeklyReport({
        userId: 1,
        weekStart: "2026-09-14T18:00:00.000Z",
        weekEnd: "2026-09-20T18:00:00.000Z",
      });
      expect(out.logs).toHaveLength(1);
      expect(out.logs![0].userId).toBe(1);
    });
  });

  // ================= deleteWeeklyReport =================
  describe("deleteWeeklyReport", () => {
    it("remove o relatório", async () => {
      const rep = seedWeeklyReport({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z" });
      await gateway.deleteWeeklyReport(rep.id);
      expect(h.world.weeklyReports).toHaveLength(0);
    });

    it("QUIRK-7K: id inexistente propaga P2025", async () => {
      await expect(gateway.deleteWeeklyReport(999)).rejects.toThrow(/Record not found/);
    });
  });

  // ================= getProjectHours =================
  describe("getProjectHours", () => {
    it("apenas completed; duration null soma 0; totalHours = sum/3600", async () => {
      const proj = seedProject({ id: 10 });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-09T10:00:00.000Z", duration: null });
      seedSession({ userId: 2, projectId: 10, startTime: "2026-09-10T10:00:00.000Z", duration: 7200 });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-11T10:00:00.000Z", duration: 9999, status: "active" });

      const out = await gateway.getProjectHours({
        projectId: 10,
        weekStart: "2026-09-07T00:00:00.000Z",
        weekEnd: "2026-09-13T23:59:59.999Z",
      });
      expect(out.projectId).toBe(10);
      expect(out.sessionCount).toBe(3);
      expect(out.totalHours).toBe(3);
    });

    it("hoursByUser agrupa por userId (userName da coluna) e VAZA linhas cruas do Prisma (QUIRK-7H)", async () => {
      seedProject({ id: 10 });
      seedSession({ userId: 1, userName: "Ana", projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 2, userName: "Bruno", projectId: 10, startTime: "2026-09-09T10:00:00.000Z", duration: 7200 });
      seedSession({ userId: 1, userName: "Ana", projectId: 10, startTime: "2026-09-10T10:00:00.000Z", duration: 1800 });

      const out = await gateway.getProjectHours({ projectId: 10 });
      expect(out.hoursByUser).toHaveLength(2);
      const ana = out.hoursByUser.find((e) => e.userId === 1)!;
      expect(ana.userName).toBe("Ana");
      expect(ana.totalHours).toBeCloseTo(1.5, 10);
      expect(ana.sessions).toHaveLength(2);
      // QUIRK-7H: sessões cruas com relações vazam no read model
      expect(ana.sessions[0]).toMatchObject({ userId: 1, userName: "Ana" });
    });

    it("QUIRK-7A: range parcial (só weekStart) é IGNORADO — todas as sessões entram", async () => {
      seedProject({ id: 10 });
      seedSession({ userId: 1, projectId: 10, startTime: "2020-01-01T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: "2030-01-01T10:00:00.000Z", duration: 3600 });

      const onlyStart = await gateway.getProjectHours({ projectId: 10, weekStart: "2026-09-07T00:00:00.000Z" });
      expect(onlyStart.sessionCount).toBe(2);

      const onlyEnd = await gateway.getProjectHours({ projectId: 10, weekEnd: "2026-09-13T23:59:59.999Z" });
      expect(onlyEnd.sessionCount).toBe(2);
    });

    it("linkedTasks mapeia session.tasks[].task", async () => {
      seedProject({ id: 10 });
      seedTask({ id: 50, title: "Task A", completed: true, projectId: 10, points: 15 });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600, tasks: [50] });

      const out = await gateway.getProjectHours({ projectId: 10 });
      expect(out.sessions[0].linkedTasks).toEqual([
        { id: 50, title: "Task A", completed: true, projectId: 10, points: 15 },
      ]);
    });
  });

  // ================= getProjectWeeklyHours =================
  describe("getProjectWeeklyHours", () => {
    it("janela [weekStart bruto, endOfWeek(weekStart)] — weekStart NÃO é normalizado para Monday (QUIRK-7L)", async () => {
      seedProject({ id: 10 });
      // FROZEN = quarta 12:00Z. Sessão antes do instante bruto, na MESMA semana: excluída.
      seedSession({ userId: 1, projectId: 10, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: new Date(FROZEN.getTime() + 3600_000), duration: 3600 });
      // semana seguinte: excluída
      seedSession({ userId: 1, projectId: 10, startTime: new Date(FROZEN.getTime() + 8 * 86_400_000), duration: 3600 });

      const out = await gateway.getProjectWeeklyHours(10, FROZEN.toISOString());
      expect(out.sessionCount).toBe(1);
      expect(out.totalHours).toBe(1);
    });

    it("endOfWeek usa weekStartsOn:1 (domingo 23:59:59.999 local)", async () => {
      seedProject({ id: 10 });
      const weekStart = startOfWeek(FROZEN, W);
      const weekEnd = endOfWeek(weekStart, W);
      seedSession({ userId: 1, projectId: 10, startTime: weekStart, duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: weekEnd, duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: new Date(weekEnd.getTime() + 1), duration: 3600 });

      const out = await gateway.getProjectWeeklyHours(10, weekStart.toISOString());
      expect(out.sessionCount).toBe(2);
    });
  });

  // ================= getProjectHoursHistory =================
  describe("getProjectHoursHistory", () => {
    it("months default 4 -> 16 semanas; months=2 -> 8; months=0 cai no default 4 (||4) -> 16", async () => {
      seedProject({ id: 10 });
      expect((await gateway.getProjectHoursHistory({ projectId: 10 })).weeks).toHaveLength(16);
      expect((await gateway.getProjectHoursHistory({ projectId: 10, months: 2 })).weeks).toHaveLength(8);
      expect((await gateway.getProjectHoursHistory({ projectId: 10, months: 1 })).weeks).toHaveLength(4);
      expect((await gateway.getProjectHoursHistory({ projectId: 10, months: 0 })).weeks).toHaveLength(16);
    });

    it("semanas i=0..n-1 via subWeeks(now,i) normalizadas (startOfWeek..endOfWeek), formato dd/MM/yyyy", async () => {
      seedProject({ id: 10 });
      const out = await gateway.getProjectHoursHistory({ projectId: 10, months: 1 });
      const expected = [0, 1, 2, 3].map((i) => {
        const ws = subWeeks(FROZEN, i);
        return {
          weekStart: format(startOfWeek(ws, W), "dd/MM/yyyy"),
          weekEnd: format(endOfWeek(ws, W), "dd/MM/yyyy"),
        };
      });
      expect(out.weeks.map((w) => [w.weekStart, w.weekEnd])).toEqual(expected.map((w) => [w.weekStart, w.weekEnd]));
    });

    it("totalHours agregado das semanas + averageHoursPerWeek", async () => {
      seedProject({ id: 10 });
      seedSession({ userId: 1, projectId: 10, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 }); // semana atual
      seedSession({ userId: 1, projectId: 10, startTime: new Date(subWeeks(FROZEN, 1).getTime() - 3600_000), duration: 7200 }); // semana -1

      const out = await gateway.getProjectHoursHistory({ projectId: 10, months: 2 });
      expect(out.projectId).toBe(10);
      expect(out.totalHours).toBe(3);
      expect(out.averageHoursPerWeek).toBeCloseTo(3 / 8, 10);
      expect(out.weeks[0].totalHours).toBe(1);
      expect(out.weeks[0].sessionCount).toBe(1);
      expect(out.weeks[1].totalHours).toBe(2);
    });
  });

  // ================= getUserProjectHours =================
  describe("getUserProjectHours", () => {
    it("itera memberships; userHours do próprio usuário; sem sessão -> 0", async () => {
      const p1 = seedProject({ id: 10, name: "Alpha", status: "active" });
      const p2 = seedProject({ id: 11, name: "Beta", status: "completed" });
      seedMember(10, 1);
      seedMember(11, 1);
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 2, projectId: 10, startTime: "2026-09-08T11:00:00.000Z", duration: 7200 });

      const out = await gateway.getUserProjectHours({ userId: 1 });
      expect(out).toHaveLength(2);
      const alpha = out.find((r) => r.projectId === p1.id)!;
      const beta = out.find((r) => r.projectId === p2.id)!;
      expect(alpha.userHours).toBe(1);
      expect(alpha.projectTotalHours).toBe(3);
      expect(alpha.sessionCount).toBe(1);
      expect(alpha.projectStatus).toBe("active");
      expect(beta.userHours).toBe(0);
      expect(beta.projectTotalHours).toBe(0);
      expect(beta.sessionCount).toBe(0);
      expect(beta.userSessions).toEqual([]);
    });

    it("sem memberships -> []", async () => {
      expect(await gateway.getUserProjectHours({ userId: 1 })).toEqual([]);
    });

    it("filtra por weekStart/weekEnd quando ambos presentes (QUIRK-7A herdado)", async () => {
      seedProject({ id: 10 });
      seedMember(10, 1);
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-08T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: "2020-01-01T10:00:00.000Z", duration: 3600 });

      const filtered = await gateway.getUserProjectHours({
        userId: 1,
        weekStart: "2026-09-07T00:00:00.000Z",
        weekEnd: "2026-09-13T23:59:59.999Z",
      });
      expect(filtered[0].userHours).toBe(1);

      const partial = await gateway.getUserProjectHours({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z" });
      expect(partial[0].userHours).toBe(2);
    });
  });

  // ================= listWeeklyHoursHistory =================
  describe("listWeeklyHoursHistory", () => {
    it("sem weekStart: todas as linhas (filtro userId), orderBy weekStart desc, user incluído", async () => {
      seedUser({ id: 1, email: "a@x.com", roles: ["VOLUNTARIO"] });
      seedWeeklyHours({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 5 });
      seedWeeklyHours({ userId: 1, weekStart: "2026-08-31T00:00:00.000Z", weekEnd: "2026-09-06T23:59:59.999Z", totalHours: 3 });
      seedWeeklyHours({ userId: 2, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 9 });

      const out = await gateway.listWeeklyHoursHistory({ userId: 1 });
      expect(out).toHaveLength(2);
      expect(out[0].totalHours).toBe(5);
      expect(out[0].user).toEqual({ id: 1, name: "Usuario 1", email: "a@x.com", roles: ["VOLUNTARIO"] });
    });

    it("com weekStart: janela [startOfWeek, endOfWeek) e orderBy totalHours desc (QUIRK-7B)", async () => {
      const weekStart = startOfWeek(FROZEN, W);
      const weekEnd = endOfWeek(FROZEN, W);
      seedWeeklyHours({ userId: 1, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 2 });
      seedWeeklyHours({ userId: 2, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 8 });
      // linha exatamente no instante endOfWeek -> EXCLUÍDA pelo `lt`
      seedWeeklyHours({ userId: 3, weekStart: weekEnd, weekEnd, totalHours: 99 });
      seedWeeklyHours({ userId: 4, weekStart: new Date(weekStart.getTime() - 1), weekEnd: new Date(weekStart.getTime() - 1), totalHours: 7 });

      const out = await gateway.listWeeklyHoursHistory({ weekStart: FROZEN.toISOString() });
      expect(out.map((r) => r.totalHours)).toEqual([8, 2]);
    });

    it("user null -> user undefined no item", async () => {
      seedWeeklyHours({ userId: 99, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 1 });
      const out = await gateway.listWeeklyHoursHistory({});
      expect(out[0].user).toBeUndefined();
    });

    it("read model: ISO strings e campos", async () => {
      seedWeeklyHours({ userId: 1, weekStart: "2026-09-07T00:00:00.000Z", weekEnd: "2026-09-13T23:59:59.999Z", totalHours: 4.5 });
      const out = await gateway.listWeeklyHoursHistory({});
      expect(out[0]).toMatchObject({
        userId: 1,
        userName: "Usuario 1",
        weekStart: "2026-09-07T00:00:00.000Z",
        weekEnd: "2026-09-13T23:59:59.999Z",
        totalHours: 4.5,
      });
    });
  });

  // ================= getWeeklyHoursStats =================
  describe("getWeeklyHoursStats", () => {
    it("currentWeek: soma, userCount e topUsers = 5 primeiros por totalHours desc", async () => {
      const weekStart = startOfWeek(FROZEN, W);
      const weekEnd = endOfWeek(FROZEN, W);
      for (let i = 1; i <= 7; i++) {
        seedWeeklyHours({ userId: i, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: i });
      }

      const out = await gateway.getWeeklyHoursStats();
      expect(out.currentWeek.weekStart).toBe(format(weekStart, "dd/MM/yyyy"));
      expect(out.currentWeek.weekEnd).toBe(format(weekEnd, "dd/MM/yyyy"));
      expect(out.currentWeek.totalHours).toBe(28);
      expect(out.currentWeek.userCount).toBe(7);
      expect(out.currentWeek.topUsers).toHaveLength(5);
      expect(out.currentWeek.topUsers.map((u) => u.totalHours)).toEqual([7, 6, 5, 4, 3]);
    });

    it("last4Weeks: i=1..4 via subWeeks(now,i), totalHours somado e userCount", async () => {
      for (let i = 1; i <= 4; i++) {
        const ws = startOfWeek(subWeeks(FROZEN, i), W);
        const we = endOfWeek(subWeeks(FROZEN, i), W);
        seedWeeklyHours({ userId: 1, weekStart: ws, weekEnd: new Date(we.getTime() - 1), totalHours: i * 2 });
        seedWeeklyHours({ userId: 2, weekStart: ws, weekEnd: new Date(we.getTime() - 1), totalHours: i });
      }

      const out = await gateway.getWeeklyHoursStats();
      expect(out.last4Weeks).toHaveLength(4);
      expect(out.last4Weeks.map((w) => w.totalHours)).toEqual([3, 6, 9, 12]);
      expect(out.last4Weeks.map((w) => w.userCount)).toEqual([2, 2, 2, 2]);
      expect(out.last4Weeks[0].weekStart).toBe(format(startOfWeek(subWeeks(FROZEN, 1), W), "dd/MM/yyyy"));
    });

    it("sem histórico -> zeros", async () => {
      const out = await gateway.getWeeklyHoursStats();
      expect(out.currentWeek.totalHours).toBe(0);
      expect(out.currentWeek.userCount).toBe(0);
      expect(out.currentWeek.topUsers).toEqual([]);
      expect(out.last4Weeks.map((w) => w.totalHours)).toEqual([0, 0, 0, 0]);
    });
  });

  // ================= resetWeeklyHoursHistory =================
  describe("resetWeeklyHoursHistory", () => {
    it("só usuários ativos; cria linha apenas com totalHours>0; savedHours string toFixed(1)", async () => {
      seedUser({ id: 1, name: "Ativo", currentWeekHours: 10 });
      seedUser({ id: 2, name: "Zerado", currentWeekHours: 12 });
      seedUser({ id: 3, name: "Inativo", status: "inactive", currentWeekHours: 7 });
      seedSession({ userId: 1, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 5400 }); // 1.5h na semana atual
      seedSession({ userId: 3, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 }); // inativo: ignorado

      const out = await gateway.resetWeeklyHoursHistory();
      const weekStart = startOfWeek(FROZEN, W);
      const weekEnd = endOfWeek(FROZEN, W);
      expect(out).toEqual([
        {
          userId: 1,
          userName: "Ativo",
          savedHours: "1.5",
          weekStart: format(weekStart, "dd/MM/yyyy"),
          weekEnd: format(weekEnd, "dd/MM/yyyy"),
        },
      ]);
      expect(h.world.weeklyHours).toHaveLength(1);
      expect(h.world.weeklyHours[0].totalHours).toBe(1.5);
    });

    it("zera currentWeekHours de TODO ativo (mesmo com 0h); inativo intocado", async () => {
      seedUser({ id: 1, currentWeekHours: 10 });
      seedUser({ id: 2, currentWeekHours: 12 });
      seedUser({ id: 3, status: "inactive", currentWeekHours: 7 });
      seedSession({ userId: 1, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 });

      await gateway.resetWeeklyHoursHistory();
      expect(h.world.users.find((u) => u.id === 1)!.currentWeekHours).toBe(0);
      expect(h.world.users.find((u) => u.id === 2)!.currentWeekHours).toBe(0);
      expect(h.world.users.find((u) => u.id === 3)!.currentWeekHours).toBe(7);
    });

    it("QUIRK-7C: não deduplica — segunda execução cria linhas duplicadas", async () => {
      seedUser({ id: 1 });
      seedSession({ userId: 1, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 });
      await gateway.resetWeeklyHoursHistory();
      await gateway.resetWeeklyHoursHistory();
      expect(h.world.weeklyHours).toHaveLength(2);
    });

    it("sessões fora da semana atual não contam", async () => {
      seedUser({ id: 1 });
      seedSession({ userId: 1, startTime: new Date(startOfWeek(FROZEN, W).getTime() - 3600_000), duration: 3600 });
      const out = await gateway.resetWeeklyHoursHistory();
      expect(out).toEqual([]);
      expect(h.world.weeklyHours).toHaveLength(0);
    });
  });

  // ================= createWeeklyHoursHistory =================
  describe("createWeeklyHoursHistory", () => {
    it("deduplica por (userId, weekStart normalizado exato) e só cria com totalHours>0", async () => {
      seedUser({ id: 1, name: "Um" });
      seedUser({ id: 2, name: "Dois" });
      seedUser({ id: 3, name: "Tres" }); // sem sessões
      const ref = "2026-09-02T12:00:00.000Z";
      const weekStart = startOfWeek(new Date(ref), W);
      const weekEnd = endOfWeek(new Date(ref), W);
      seedWeeklyHours({ userId: 1, weekStart, weekEnd: new Date(weekEnd.getTime() - 1), totalHours: 99 }); // existing -> skip
      seedSession({ userId: 1, startTime: new Date(weekStart.getTime() + 86_400_000), duration: 3600 });
      seedSession({ userId: 2, startTime: new Date(weekStart.getTime() + 86_400_000), duration: 7200 });

      const out = await gateway.createWeeklyHoursHistory(ref);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        userId: 2,
        userName: "Dois",
        totalHours: 2,
        weekStart: format(weekStart, "dd/MM/yyyy"),
        weekEnd: format(weekEnd, "dd/MM/yyyy"),
      });
      expect(h.world.weeklyHours).toHaveLength(2); // existing + nova
    });

    it("totalHours é numérico (contraste com savedHours string do reset)", async () => {
      seedUser({ id: 1 });
      const ref = "2026-09-02T12:00:00.000Z";
      const weekStart = startOfWeek(new Date(ref), W);
      seedSession({ userId: 1, startTime: new Date(weekStart.getTime() + 3600_000), duration: 5400 });
      const out = await gateway.createWeeklyHoursHistory(ref);
      expect(typeof out[0].totalHours).toBe("number");
      expect(out[0].totalHours).toBe(1.5);
    });

    it("sessões fora da janela da semana não contam", async () => {
      seedUser({ id: 1 });
      const ref = "2026-09-02T12:00:00.000Z";
      const weekStart = startOfWeek(new Date(ref), W);
      seedSession({ userId: 1, startTime: new Date(weekStart.getTime() - 3600_000), duration: 3600 });
      expect(await gateway.createWeeklyHoursHistory(ref)).toEqual([]);
    });
  });

  // ================= getProjectStats =================
  describe("getProjectStats", () => {
    it("por projeto: memberCount, horas/sessões da semana atual, members mapeados", async () => {
      seedUser({ id: 1 });
      seedUser({ id: 2 });
      const p1 = seedProject({ id: 10, name: "Alpha", status: "active" });
      seedMember(10, 1, ["COORDENADOR"]);
      seedMember(10, 2, ["COLABORADOR"]);
      seedSession({ userId: 1, projectId: 10, startTime: new Date(FROZEN.getTime() - 3600_000), duration: 3600 });
      seedSession({ userId: 2, projectId: 10, startTime: new Date(startOfWeek(FROZEN, W).getTime() - 3600_000), duration: 3600 }); // semana anterior

      const out = await gateway.getProjectStats();
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({
        projectId: p1.id,
        projectName: "Alpha",
        projectStatus: "active",
        memberCount: 2,
        currentWeekHours: 1,
        currentWeekSessions: 1,
        members: [
          { userId: 1, userName: "Usuario 1", roles: ["COORDENADOR"] },
          { userId: 2, userName: "Usuario 2", roles: ["COLABORADOR"] },
        ],
      });
    });

    it("sem projetos -> []", async () => {
      expect(await gateway.getProjectStats()).toEqual([]);
    });
  });

  // ================= createProjectReport =================
  describe("createProjectReport", () => {
    const monthlyRef = "2026-09-16T12:00:00.000Z";

    it("acesso: projeto inexistente -> 'Projeto não encontrado'", async () => {
      await expect(
        gateway.createProjectReport({
          actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 999,
          periodType: "monthly", reference: monthlyRef, content: "ok",
        }),
      ).rejects.toThrow("Projeto não encontrado");
    });

    it("acesso: QUIRK-7J — membership NÃO dá acesso; só MANAGE_USERS (COORDENADOR/GERENTE) ou leaderId", async () => {
      seedUser({ id: 1 });
      seedUser({ id: 2 });
      seedUser({ id: 3 });
      seedProject({ id: 10, leaderId: 2 });
      seedMember(10, 1, ["COLABORADOR"]);
      await expect(
        gateway.createProjectReport({
          actorUserId: 1, actorRoles: ["VOLUNTARIO"], projectId: 10,
          periodType: "monthly", reference: monthlyRef, content: "ok",
        }),
      ).rejects.toThrow("Acesso negado");

      // líder OK
      const asLeader = await gateway.createProjectReport({
        actorUserId: 2, actorRoles: ["VOLUNTARIO"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, content: "do líder",
      });
      expect(asLeader.created).toBe(true);

      // GERENTE (MANAGE_USERS) OK mesmo sem liderar
      const asGerente = await gateway.createProjectReport({
        actorUserId: 3, actorRoles: ["GERENTE"], projectId: 10,
        periodType: "weekly", reference: monthlyRef, content: "do gerente",
      });
      expect(asGerente.created).toBe(true);
    });

    it("validações: conteúdo vazio, periodicidade inválida, referência inválida (ordem: acesso -> conteúdo -> tipo -> referência)", async () => {
      seedProject({ id: 10 });
      await expect(
        gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: monthlyRef, content: "   " }),
      ).rejects.toThrow("Dados inválidos: conteúdo obrigatório");
      await expect(
        gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "quinzenal" as any, reference: monthlyRef, content: "ok" }),
      ).rejects.toThrow("Dados inválidos: periodicidade inválida");
      await expect(
        gateway.createProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10, periodType: "monthly", reference: "data-invalida", content: "ok" }),
      ).rejects.toThrow("Dados inválidos: referência inválida");
    });

    it("cria com janela computePeriod SP-anchored (monthly) e label do período", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10, name: "Alpha" });
      const out = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, title: "Relatório M", content: "conteudo mensal",
      });
      expect(out.created).toBe(true);
      expect(out.report.projectName).toBe("Alpha");
      expect(out.report.authorName).toBe("Usuario 1");
      expect(out.report.periodType).toBe("monthly");
      expect(out.report.periodLabel).toBe("setembro/2026");
      expect(out.report.periodStart).toBe("2026-09-01T03:00:00.000Z");
      expect(out.report.periodEnd).toBe("2026-10-01T02:59:59.999Z");
      expect(out.report.title).toBe("Relatório M");
      expect(out.report.content).toBe("conteudo mensal");
      expect(out.report.attachments).toEqual([]);
    });

    it("reference ausente usa new Date() (relógio congelado)", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const out = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", content: "ok",
      });
      expect(out.report.periodStart).toBe("2026-09-01T03:00:00.000Z");
    });

    it("upsert: mesma (projectId, periodType, periodStart, authorId) atualiza e created=false; autor diferente cria linha separada", async () => {
      seedUser({ id: 1 });
      seedUser({ id: 2 });
      seedProject({ id: 10 });
      const first = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, title: "v1", content: "conteudo v1",
      });
      const second = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, title: null, content: "conteudo v2",
      });
      expect(second.created).toBe(false);
      expect(second.report.id).toBe(first.report.id);
      expect(second.report.content).toBe("conteudo v2");
      expect(second.report.title).toBeNull();

      const otherAuthor = await gateway.createProjectReport({
        actorUserId: 2, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, content: "de outro autor",
      });
      expect(otherAuthor.created).toBe(true);
      expect(otherAuthor.report.id).not.toBe(first.report.id);
      expect(h.world.projectReports).toHaveLength(2);
    });

    it("notificação só na CRIAÇÃO: COORDENADOR/GERENTE ativos exceto autor; payload exato", async () => {
      seedProject({ id: 10, name: "Alpha" });
      seedUser({ id: 1, name: "Autor" }); // autor também coordenador
      const coord = seedUser({ id: 2, name: "Coord", roles: ["COORDENADOR"] });
      const ger = seedUser({ id: 3, name: "Ger", roles: ["GERENTE"] });
      seedUser({ id: 4, name: "Lab", roles: ["LABORATORISTA"] });
      seedUser({ id: 5, name: "Inativo Coord", roles: ["COORDENADOR"], status: "inactive" });

      const out = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, content: "ok",
      });
      expect(notifications.publishEvent).toHaveBeenCalledTimes(1);
      expect(notifications.publishEvent).toHaveBeenCalledWith({
        eventType: "PROJECT_REPORT_SUBMITTED",
        title: "Novo relatório de projeto",
        message: "setembro/2026 · Alpha",
        data: { reportId: out.report.id, projectId: 10 },
        audience: { mode: "USER_IDS", userIds: [coord.id, ger.id] },
        triggeredByUserId: 1,
      });
    });

    it("sem destinatários -> publishEvent não é chamado; update não notifica", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, content: "ok",
      });
      expect(notifications.publishEvent).not.toHaveBeenCalled();
    });

    it("falha de notificação é engolida (console.error) e a criação persiste", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      seedUser({ id: 2, roles: ["COORDENADOR"] });
      notifications.publishEvent.mockRejectedValueOnce(new Error("bus down"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

      const out = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "monthly", reference: monthlyRef, content: "ok",
      });
      expect(out.created).toBe(true);
      expect(spy).toHaveBeenCalledWith(
        "Erro ao notificar gerência sobre relatório:",
        expect.any(Error),
      );
    });

    it("QUIRK-7E: weekly — read model usa label date-fns LOCAL 'Semana dd/MM–dd/MM'; notificação usa label SP 'Semana de dd/MM a dd/MM'", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10, name: "Alpha" });
      seedUser({ id: 2, roles: ["COORDENADOR"] });
      const out = await gateway.createProjectReport({
        actorUserId: 1, actorRoles: ["COORDENADOR"], projectId: 10,
        periodType: "weekly", reference: monthlyRef, content: "ok",
      });
      // computePeriod SP-anchored: janela fixa independente do fuso da máquina
      expect(out.report.periodStart).toBe("2026-09-14T03:00:00.000Z");
      expect(out.report.periodEnd).toBe("2026-09-21T02:59:59.999Z");
      // read model: fórmula date-fns local (pina a fórmula, não o fuso)
      const expectedLocal = `Semana ${format(new Date("2026-09-14T03:00:00.000Z"), "dd/MM")}–${format(new Date("2026-09-21T02:59:59.999Z"), "dd/MM")}`;
      expect(out.report.periodLabel).toBe(expectedLocal);
      // notificação: label SP-anchored
      expect(notifications.publishEvent.mock.calls[0][0].message).toBe("Semana de 14/09 a 20/09 · Alpha");
    });
  });

  // ================= updateProjectReport =================
  describe("updateProjectReport", () => {
    it("inexistente -> 'Relatório não encontrado'", async () => {
      await expect(
        gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999, content: "x" }),
      ).rejects.toThrow("Relatório não encontrado");
    });

    it("autor pode atualizar; não-autor não-manager -> 'Acesso negado'; manager pode em qualquer relatório", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      await gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id, content: "do autor" });
      await expect(
        gateway.updateProjectReport({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: rep.id, content: "invasor" }),
      ).rejects.toThrow("Acesso negado");
      await gateway.updateProjectReport({ actorUserId: 3, actorRoles: ["GERENTE"], reportId: rep.id, content: "do gerente" });
      expect(h.world.projectReports[0].content).toBe("do gerente");
    });

    it("atualização parcial: omitir title preserva; title null zera; content preservado quando omitido", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1, title: "T original", content: "C original" });
      const out = await gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id, title: null });
      expect(out.title).toBeNull();
      expect(out.content).toBe("C original");

      const out2 = await gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id, title: "T novo" });
      expect(out2.title).toBe("T novo");
    });

    it("QUIRK-7F: update NÃO valida conteúdo — string vazia é aceita", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1, content: "original" });
      const out = await gateway.updateProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id, content: "" });
      expect(out.content).toBe("");
    });
  });

  // ================= deleteProjectReport =================
  describe("deleteProjectReport", () => {
    it("QUIRK-7G: autor NÃO-manager não pode excluir o próprio relatório", async () => {
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      await expect(
        gateway.deleteProjectReport({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id }),
      ).rejects.toThrow("Acesso negado");
      expect(h.world.projectReports).toHaveLength(1);
    });

    it("inexistente -> 'Relatório não encontrado' (após checagem de role)", async () => {
      await expect(
        gateway.deleteProjectReport({ actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999 }),
      ).rejects.toThrow("Relatório não encontrado");
    });

    it("manager exclui: remove arquivos dos anexos via storage e cascade apaga anexos", async () => {
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      seedAttachment({ reportId: rep.id, storedPath: "reports/10/a.pdf" });
      seedAttachment({ reportId: rep.id, storedPath: "reports/10/b.pdf" });

      await gateway.deleteProjectReport({ actorUserId: 2, actorRoles: ["COORDENADOR"], reportId: rep.id });
      expect(h.world.projectReports).toHaveLength(0);
      expect(h.world.reportAttachments).toHaveLength(0);
      expect(h.removeStoredReportFile).toHaveBeenCalledTimes(2);
      expect(h.world.storage.removed).toEqual(["reports/10/a.pdf", "reports/10/b.pdf"]);
    });
  });

  // ================= getProjectReport =================
  describe("getProjectReport", () => {
    it("inexistente -> LANÇA 'Relatório não encontrado' (não retorna null)", async () => {
      await expect(gateway.getProjectReport(1, ["COORDENADOR"], 999)).rejects.toThrow("Relatório não encontrado");
    });

    it("acesso de leitura: manager OK; líder OK; estranho -> 'Acesso negado'", async () => {
      seedUser({ id: 1 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      seedProject({ id: 10, leaderId: 2 });
      expect((await gateway.getProjectReport(3, ["COORDENADOR"], rep.id))!.id).toBe(rep.id);
      expect((await gateway.getProjectReport(2, ["VOLUNTARIO"], rep.id))!.id).toBe(rep.id);
      await expect(gateway.getProjectReport(4, ["VOLUNTARIO"], rep.id)).rejects.toThrow("Acesso negado");
    });

    it("read model: anexos ordenados por createdAt asc; autor com nome null-safe do schema", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      seedAttachment({ reportId: rep.id, storedPath: "b.pdf", createdAt: "2026-09-03T00:00:00.000Z" });
      seedAttachment({ reportId: rep.id, storedPath: "a.pdf", createdAt: "2026-09-02T00:00:00.000Z" });
      const out = await gateway.getProjectReport(1, ["COORDENADOR"], rep.id);
      expect(out!.attachments.map((a) => a.fileName)).toEqual(["arquivo.pdf", "arquivo.pdf"]);
      expect(out!.attachments.map((a) => a.storedPath)).toEqual(["a.pdf", "b.pdf"]);
      expect(out!.attachments[0]).toEqual({
        id: expect.any(Number),
        fileName: "arquivo.pdf",
        storedPath: "a.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1234,
        createdAt: "2026-09-02T00:00:00.000Z",
      });
    });
  });

  // ================= listProjectReports =================
  describe("listProjectReports", () => {
    it("manager: vê todos os projetos; filtros periodType/authorId/from/to; orderBy periodStart desc", async () => {
      seedUser({ id: 1 });
      seedUser({ id: 2 });
      seedProject({ id: 10 });
      seedProject({ id: 11 });
      const r1 = seedProjectReport({ projectId: 10, authorId: 1, periodType: "monthly", periodStart: "2026-09-01T03:00:00.000Z", periodEnd: "2026-10-01T02:59:59.999Z" });
      const r2 = seedProjectReport({ projectId: 11, authorId: 2, periodType: "weekly", periodStart: "2026-09-14T03:00:00.000Z", periodEnd: "2026-09-21T02:59:59.999Z" });
      const r3 = seedProjectReport({ projectId: 10, authorId: 1, periodType: "monthly", periodStart: "2026-08-01T03:00:00.000Z", periodEnd: "2026-09-01T02:59:59.999Z" });

      const all = await gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"] });
      expect(all.map((r) => r.id)).toEqual([r2.id, r1.id, r3.id]);

      const monthly = await gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"], periodType: "monthly" });
      expect(monthly.map((r) => r.id)).toEqual([r1.id, r3.id]);

      const byAuthor = await gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"], authorId: 2 });
      expect(byAuthor.map((r) => r.id)).toEqual([r2.id]);

      const byRange = await gateway.listProjectReports({
        actorUserId: 5, actorRoles: ["COORDENADOR"],
        from: "2026-09-01T00:00:00.000Z", to: "2026-09-30T00:00:00.000Z",
      });
      // QUIRK-7M: from e to colidem na MESMA chave `periodStart` no spread do where —
      // o `to` (lte) sobrescreve o `from` (gte): com ambos, o from é DESCARTADO.
      expect(byRange.map((r) => r.id)).toEqual([r2.id, r1.id, r3.id]);

      const fromOnly = await gateway.listProjectReports({
        actorUserId: 5, actorRoles: ["COORDENADOR"],
        from: "2026-09-01T00:00:00.000Z",
      });
      expect(fromOnly.map((r) => r.id)).toEqual([r2.id, r1.id]);

      const byProject = await gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"], projectId: 10 });
      expect(byProject.map((r) => r.id)).toEqual([r1.id, r3.id]);
    });

    it("líder: vê relatórios dos projetos que lidera (independente do autor)", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10, leaderId: 2 });
      seedProject({ id: 11, leaderId: 3 });
      const r1 = seedProjectReport({ projectId: 10, authorId: 1 });
      seedProjectReport({ projectId: 11, authorId: 1 });

      const out = await gateway.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"] });
      expect(out.map((r) => r.id)).toEqual([r1.id]);
    });

    it("líder com projectId que NÃO lidera -> 'Acesso negado'", async () => {
      seedProject({ id: 10, leaderId: 2 });
      seedProjectReport({ projectId: 11, authorId: 1 });
      await expect(
        gateway.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], projectId: 11 }),
      ).rejects.toThrow("Acesso negado");
    });

    it("QUIRK-7J: sem projetos liderados -> 'Acesso negado' mesmo sem filtro projectId", async () => {
      seedProject({ id: 10 });
      seedProjectReport({ projectId: 10, authorId: 1 });
      await expect(
        gateway.listProjectReports({ actorUserId: 2, actorRoles: ["VOLUNTARIO"] }),
      ).rejects.toThrow("Acesso negado");
    });

    it("sem relatórios -> []", async () => {
      expect(await gateway.listProjectReports({ actorUserId: 5, actorRoles: ["COORDENADOR"] })).toEqual([]);
    });
  });

  // ================= aggregateProjectReport =================
  describe("aggregateProjectReport", () => {
    function seedAggregateFixture() {
      seedUser({ id: 1 });
      seedUser({ id: 2 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({
        projectId: 10,
        authorId: 1,
        periodType: "monthly",
        periodStart: "2026-09-01T03:00:00.000Z",
        periodEnd: "2026-10-01T02:59:59.999Z",
      });
      // logs dentro da janela (2) + fora (1) + de outro projeto (1)
      seedDailyLog({ userId: 1, projectId: 10, date: "2026-09-10T12:00:00.000Z", note: "log A" });
      const s1 = seedSession({ userId: 2, projectId: 10, startTime: "2026-09-11T10:00:00.000Z", endTime: "2026-09-11T12:00:00.000Z", duration: 7200 });
      seedDailyLog({ userId: 2, projectId: 10, date: "2026-09-11T12:00:00.000Z", note: "log B", workSessionId: s1.id });
      seedDailyLog({ userId: 1, projectId: 10, date: "2026-10-05T12:00:00.000Z", note: "fora" });
      seedDailyLog({ userId: 1, projectId: 11, date: "2026-09-12T12:00:00.000Z", note: "outro projeto" });
      // sessões na janela: completed + ACTIVE (QUIRK-7D) + null duration; fora da janela
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-05T10:00:00.000Z", duration: 3600 });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-09-06T10:00:00.000Z", duration: null, status: "active" });
      seedSession({ userId: 1, projectId: 10, startTime: "2026-10-05T10:00:00.000Z", duration: 3600 });
      return rep;
    }

    it("logs da janela (orderBy date desc) com userName e times da workSession vinculada", async () => {
      const rep = seedAggregateFixture();
      const out = await gateway.aggregateProjectReport(1, ["COORDENADOR"], rep.id);
      expect(out.logs.map((l) => l.note)).toEqual(["log B", "log A"]);
      expect(out.logs[0].userName).toBe("Usuario 2");
      expect(out.logs[0].startTime).toBe("2026-09-11T10:00:00.000Z");
      expect(out.logs[0].endTime).toBe("2026-09-11T12:00:00.000Z");
      expect(out.logs[0].projectName).toBe("Projeto");
      expect(out.logs[1].startTime).toBeNull();
      expect(out.logs[1].endTime).toBeNull();
    });

    it("QUIRK-7D: sessions SEM filtro de status — active entra; duration null -> durationHours null", async () => {
      const rep = seedAggregateFixture();
      const out = await gateway.aggregateProjectReport(1, ["COORDENADOR"], rep.id);
      // s1 (vinculada ao log B) também está na janela: 3 sessões
      expect(out.sessions).toHaveLength(3);
      expect(out.sessions[0].startTime).toBe("2026-09-11T10:00:00.000Z"); // orderBy startTime desc
      expect(out.sessions[0].durationHours).toBe(2);
      expect(out.sessions[1].startTime).toBe("2026-09-06T10:00:00.000Z"); // active (QUIRK-7D)
      expect(out.sessions[1].durationHours).toBeNull();
      expect(out.sessions[2].durationHours).toBe(1);
    });

    it("totals: logCount/sessionCount/totalHours (duration ?? 0 / 3600)", async () => {
      const rep = seedAggregateFixture();
      const out = await gateway.aggregateProjectReport(1, ["COORDENADOR"], rep.id);
      expect(out.totals).toEqual({ logCount: 2, sessionCount: 3, totalHours: 3 });
      expect(out.report.id).toBe(rep.id);
    });

    it("acesso via getProjectReport: inexistente lança; não-autorizado lança", async () => {
      const rep = seedAggregateFixture();
      await expect(gateway.aggregateProjectReport(1, ["COORDENADOR"], 999)).rejects.toThrow("Relatório não encontrado");
      await expect(gateway.aggregateProjectReport(2, ["VOLUNTARIO"], rep.id)).rejects.toThrow("Acesso negado");
    });
  });

  // ================= registerReportAttachment =================
  describe("registerReportAttachment", () => {
    it("inexistente -> 'Relatório não encontrado'", async () => {
      await expect(
        gateway.registerReportAttachment({
          actorUserId: 1, actorRoles: ["COORDENADOR"], reportId: 999,
          fileName: "a.pdf", storedPath: "reports/999/a.pdf", mimeType: "application/pdf", sizeBytes: 1,
        }),
      ).rejects.toThrow("Relatório não encontrado");
    });

    it("não-autor não-manager -> 'Acesso negado'; autor OK (uploadedBy = actor)", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      await expect(
        gateway.registerReportAttachment({
          actorUserId: 2, actorRoles: ["VOLUNTARIO"], reportId: rep.id,
          fileName: "a.pdf", storedPath: "reports/10/a.pdf", mimeType: "application/pdf", sizeBytes: 1,
        }),
      ).rejects.toThrow("Acesso negado");

      const out = await gateway.registerReportAttachment({
        actorUserId: 1, actorRoles: ["VOLUNTARIO"], reportId: rep.id,
        fileName: "a.pdf", storedPath: "reports/10/a.pdf", mimeType: "application/pdf", sizeBytes: 4321,
      });
      expect(out.attachments).toHaveLength(1);
      expect(out.attachments[0]).toMatchObject({ fileName: "a.pdf", storedPath: "reports/10/a.pdf", sizeBytes: 4321 });
      expect(h.world.reportAttachments[0].uploadedBy).toBe(1);
    });

    it("manager anexa em relatório de outro autor", async () => {
      seedUser({ id: 1 });
      seedProject({ id: 10 });
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      const out = await gateway.registerReportAttachment({
        actorUserId: 3, actorRoles: ["GERENTE"], reportId: rep.id,
        fileName: "m.pdf", storedPath: "reports/10/m.pdf", mimeType: "application/pdf", sizeBytes: 2,
      });
      expect(out.attachments).toHaveLength(1);
    });
  });

  // ================= deleteReportAttachment =================
  describe("deleteReportAttachment", () => {
    it("inexistente -> 'Anexo não encontrado'", async () => {
      await expect(
        gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["COORDENADOR"], attachmentId: 999 }),
      ).rejects.toThrow("Anexo não encontrado");
    });

    it("uploader pode excluir; não-uploader não-manager -> 'Acesso negado'; manager pode", async () => {
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      const a1 = seedAttachment({ reportId: rep.id, uploadedBy: 1, storedPath: "reports/10/a.pdf" });
      const a2 = seedAttachment({ reportId: rep.id, uploadedBy: 2, storedPath: "reports/10/b.pdf" });

      await gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: a1.id });
      await expect(
        gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: a2.id }),
      ).rejects.toThrow("Acesso negado");
      await gateway.deleteReportAttachment({ actorUserId: 3, actorRoles: ["COORDENADOR"], attachmentId: a2.id });
      expect(h.world.reportAttachments).toHaveLength(0);
    });

    it("removeStoredReportFile chamado com storedPath antes do delete da linha", async () => {
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      const a = seedAttachment({ reportId: rep.id, uploadedBy: 1, storedPath: "reports/10/x.pdf" });
      await gateway.deleteReportAttachment({ actorUserId: 1, actorRoles: ["VOLUNTARIO"], attachmentId: a.id });
      expect(h.world.storage.removed).toEqual(["reports/10/x.pdf"]);
    });
  });

  // ================= sweepStaleReportUploads =================
  describe("sweepStaleReportUploads", () => {
    it("delega ao storage com a lista de storedPaths referenciados + maxAgeMs", async () => {
      const rep = seedProjectReport({ projectId: 10, authorId: 1 });
      seedAttachment({ reportId: rep.id, storedPath: "reports/10/a.pdf" });
      seedAttachment({ reportId: rep.id, storedPath: "reports/10/b.pdf" });
      h.world.storage.sweepResult = 3;

      const out = await gateway.sweepStaleReportUploads(60_000);
      expect(out).toBe(3);
      expect(h.sweepStaleReportUploads).toHaveBeenCalledTimes(1);
      expect(h.sweepStaleReportUploads.mock.calls[0][0]).toEqual(["reports/10/a.pdf", "reports/10/b.pdf"]);
      expect(h.sweepStaleReportUploads.mock.calls[0][1]).toBe(60_000);
    });

    it("sem anexos -> lista vazia", async () => {
      const out = await gateway.sweepStaleReportUploads();
      expect(out).toBe(0);
      expect(h.sweepStaleReportUploads.mock.calls[0][0]).toEqual([]);
      expect(h.sweepStaleReportUploads.mock.calls[0][1]).toBeUndefined();
    });
  });
});
