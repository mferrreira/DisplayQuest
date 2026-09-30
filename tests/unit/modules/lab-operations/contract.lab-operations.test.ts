// @vitest-environment node
/**
 * OND8-B3 — contract test lab-operations: OLD (DefaultLabOperationsGateway legado intacto +
 * repositórios legados) vs NEW (createLabOperationsModule com use cases sobre adapters Prisma
 * finos) sobre o MESMO fake Prisma (DEC-18): cada chamada reconstrói os dois lados do seed
 * pristino e compara no limite JSON-observável + estado da store serializado + eventos
 * publicados; erros comparados por MENSAGEM. Sem divergências (todos os quirks 8L1-8L15
 * preservados na wiring nova).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { labHarness } from "./lab-fake-prisma";

vi.mock("@/lib/database/prisma", () => ({ prisma: labHarness.prisma }));

import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { NotificationsLabPublisher } from "@/backend/modules/lab-operations/infrastructure/adapters/notifications-lab-publisher";
import { PrismaLabDirectory } from "@/backend/modules/lab-operations/infrastructure/adapters/prisma-lab-directory";
import { PrismaIssueRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-issue.repository";
import { PrismaLabEventRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-lab-event.repository";
import { PrismaLabNoticeRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-lab-notice.repository";
import { PrismaLaboratoryScheduleRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-laboratory-schedule.repository";
import { PrismaResponsibilityRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-responsibility.repository";
import { PrismaUserScheduleRepository } from "@/backend/modules/lab-operations/infrastructure/repositories/prisma-user-schedule.repository";

const FROZEN = new Date("2026-09-16T12:00:00.000Z");

function buildOldSide() {
  return createLabOperationsModule({
    gatewayDependencies: {
      notificationsModule: labHarness.notificationsSink as any,
      identityAccess: createIdentityAccessModule(),
    },
  });
}

function buildNewSide() {
  return createLabOperationsModule({
    ports: {
      issues: new PrismaIssueRepository(),
      labEvents: new PrismaLabEventRepository(),
      labNotices: new PrismaLabNoticeRepository(),
      laboratorySchedules: new PrismaLaboratoryScheduleRepository(),
      responsibilities: new PrismaResponsibilityRepository(),
      userSchedules: new PrismaUserScheduleRepository(),
      directory: new PrismaLabDirectory(),
      publisher: new NotificationsLabPublisher(labHarness.notificationsSink),
    },
  });
}

interface RunResult {
  ok: boolean;
  value?: unknown;
  message?: string;
}

async function runOnce(side: any, call: (lab: any) => Promise<unknown>) {
  try {
    const value = await call(side);
    return {
      result: { ok: true, value: JSON.parse(JSON.stringify(value ?? null)) },
      snapshot: labHarness.snapshot(),
      published: JSON.parse(JSON.stringify(labHarness.published)),
    };
  } catch (error: any) {
    return { result: { ok: false, message: error?.message }, snapshot: labHarness.snapshot(), published: [...labHarness.published] };
  }
}

async function parity(seed: () => void, call: (lab: any) => Promise<unknown>) {
  labHarness.reset();
  seed();
  const old = await runOnce(buildOldSide(), call);

  labHarness.reset();
  seed();
  const new_ = await runOnce(buildNewSide(), call);

  if (!old.result.ok && !new_.result.ok) {
    expect(new_.result.message).toBe(old.result.message);
  } else {
    expect(new_.result.ok).toBe(old.result.ok);
    expect(new_.result.value).toEqual(old.result.value);
  }
  expect(new_.snapshot).toEqual(old.snapshot);
  expect(new_.published).toEqual(old.published);

  return old;
}

const seedIssue = (overrides: Partial<{ title: string; description: string; status: string; priority: string; category: string | null; reporterId: number; assigneeId: number | null; resolvedAt: string | null }> = {}) => {
  const row = {
    id: labHarness.world.seq.issue++,
    title: overrides.title ?? `Issue ${labHarness.world.seq.issue}`,
    description: overrides.description ?? "descricao",
    status: overrides.status ?? "open",
    priority: overrides.priority ?? "medium",
    category: overrides.category ?? null,
    reporterId: overrides.reporterId ?? 1,
    assigneeId: overrides.assigneeId ?? null,
    createdAt: new Date(FROZEN.getTime() + labHarness.world.issues.length * 1000),
    updatedAt: new Date(),
    resolvedAt: overrides.resolvedAt ?? null,
  };
  labHarness.world.issues.push(row);
  return row;
};

const seedLabEvent = (overrides: Partial<{ userId: number; userName: string; date: Date; note: string }> = {}) => {
  const row = {
    id: labHarness.world.seq.labEvent++,
    userId: overrides.userId ?? 1,
    userName: overrides.userName ?? "U",
    date: overrides.date ?? new Date(FROZEN.getTime() + labHarness.world.labEvents.length * 1000),
    note: overrides.note ?? "nota",
    createdAt: new Date(),
  };
  labHarness.world.labEvents.push(row);
  return row;
};

const seedNotice = (overrides: Partial<{ performedBy: number; description: string; userName: string }> = {}) => {
  const row = {
    id: labHarness.world.seq.history++,
    entityType: "LAB_NOTICE",
    entityId: 0,
    action: "CREATE",
    performedBy: overrides.performedBy ?? 1,
    performedAt: new Date(FROZEN.getTime() + labHarness.world.history.length * 1000),
    oldValues: null,
    newValues: null,
    description: overrides.description ?? "aviso",
    metadata: { userName: overrides.userName ?? "U" },
  };
  labHarness.world.history.push(row);
  return row;
};

const seedLabSchedule = (overrides: Partial<{ dayOfWeek: number; startTime: string; endTime: string; notes: string | null }> = {}) => {
  const row = {
    id: labHarness.world.seq.labSchedule++,
    dayOfWeek: overrides.dayOfWeek ?? 1,
    startTime: overrides.startTime ?? "08:00",
    endTime: overrides.endTime ?? "12:00",
    notes: overrides.notes ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  labHarness.world.labSchedules.push(row);
  return row;
};

const seedResponsibility = (overrides: Partial<{ userId: number; userName: string; startTime: string; endTime: string | null; pausedAt: string | null; totalPausedMs: number; notes: string | null }> = {}) => {
  const row = {
    id: labHarness.world.seq.responsibility++,
    userId: overrides.userId ?? 1,
    userName: overrides.userName ?? "Resp",
    startTime: overrides.startTime ?? "2026-09-16T10:00:00.000Z",
    endTime: overrides.endTime ?? null,
    pausedAt: overrides.pausedAt ?? null,
    totalPausedMs: overrides.totalPausedMs ?? 0,
    notes: overrides.notes ?? null,
  };
  labHarness.world.responsibilities.push(row);
  return row;
};

const seedUserSchedule = (overrides: Partial<{ userId: number; dayOfWeek: number; startTime: string; endTime: string }> = {}) => {
  const row = {
    id: labHarness.world.seq.userSchedule++,
    userId: overrides.userId ?? 1,
    dayOfWeek: overrides.dayOfWeek ?? 1,
    startTime: overrides.startTime ?? "08:00",
    endTime: overrides.endTime ?? "12:00",
    createdAt: new Date(),
  };
  labHarness.world.userSchedules.push(row);
  return row;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("contract lab — issues", () => {
  it("listIssues: precedência mutuamente exclusiva + search em memória (QUIRK-8L3)", async () => {
    const seed = () => {
      labHarness.seedUser();
      seedIssue({ title: "Impressora quebrada", description: "papel atolado", status: "open", priority: "high", category: "equipamento", reporterId: 1 });
      seedIssue({ title: " rede caiu ", description: "switch", status: "in_progress", priority: "low", category: null, reporterId: 1 });
      seedIssue({ title: "outra", description: "d", status: "closed", priority: "urgent", category: "rede", reporterId: 1, assigneeId: 2 });
    };
    await parity(seed, (lab) => lab.listIssues());
    await parity(seed, (lab) => lab.listIssues({ status: "open", priority: "high" }));
    await parity(seed, (lab) => lab.listIssues({ priority: "high", search: "rede" }));
    await parity(seed, (lab) => lab.listIssues({ category: "equipamento" }));
    await parity(seed, (lab) => lab.listIssues({ reporterId: 1, assigneeId: 2 }));
    await parity(seed, (lab) => lab.listIssues({ assigneeId: 2 }));
    await parity(seed, (lab) => lab.listIssues({ search: " IMPRESSORA " }));
  });

  it("getIssue existente/inexistente + deleteIssue inexistente", async () => {
    const seed = () => {
      labHarness.seedUser();
      seedIssue();
    };
    await parity(seed, (lab) => lab.getIssue(1));
    await parity(seed, (lab) => lab.getIssue(999));
    await parity(seed, (lab) => lab.deleteIssue(999));
    await parity(seed, (lab) => lab.deleteIssue(1));
  });

  it("createIssue: happy + notify (QUIRK-8L2/8L8) + validações verbatim", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["VOLUNTARIO"] });
      labHarness.seedUser({ roles: ["LABORATORISTA"] });
      labHarness.seedUser({ roles: ["COORDENADOR"], status: "inactive" });
    };
    const raised = await parity(seed, (lab) => lab.createIssue({ title: " Impressora quebrada ", description: " papel atolado ", reporterId: 1 }));
    expect(raised.published).toHaveLength(1);
    expect(raised.published[0]).toMatchObject({ eventType: "LAB_ISSUE_RAISED", title: "Nova issue do laboratório", audience: { mode: "USER_IDS", userIds: [2] }, triggeredByUserId: 1 });

    await parity(seed, (lab) => lab.createIssue({ title: "  ", description: "d", reporterId: 1 }));
    await parity(seed, (lab) => lab.createIssue({ title: "t", description: " ", reporterId: 1 }));
    await parity(seed, (lab) => lab.createIssue({ title: "t", description: "d", reporterId: 0 }));
    await parity(seed, (lab) => lab.createIssue({ title: "t", description: "d", reporterId: 1, priority: "urgente" }));
    await parity(seed, (lab) => lab.createIssue({ title: "t", description: "d", reporterId: 1, priority: "high", category: "c", assigneeId: 2 }));

    // sem destinatarios ativos (so reporter) => sem publicacao
    await parity(
      () => labHarness.seedUser({ roles: ["LABORATORISTA"] }),
      (lab) => lab.createIssue({ title: "t", description: "d", reporterId: 1 }),
    );
  });

  it("updateIssue: merge parcial + priority arbitrary -> enum error (QUIRK-8L4) + inexistente", async () => {
    const seed = () => {
      labHarness.seedUser();
      seedIssue();
    };
    await parity(seed, (lab) => lab.updateIssue(1, { title: " novo ", category: "" }));
    await parity(seed, (lab) => lab.updateIssue(1, { priority: "urgente" }));
    await parity(seed, (lab) => lab.updateIssue(1, { title: " " }));
    await parity(seed, (lab) => lab.updateIssue(999, { title: "x" }));
  });

  it("assign/unassign/start/resolve/close/reopen (QUIRK-8L5/8L6/8L7)", async () => {
    const seed = () => {
      labHarness.seedUser();
      labHarness.seedUser();
      seedIssue({ status: "resolved", resolvedAt: "2026-09-15T12:00:00.000Z" });
    };
    const assigned = await parity(seed, (lab) => lab.assignIssue(1, 2));
    expect(assigned.published).toHaveLength(1);
    expect(assigned.published[0]).toMatchObject({ eventType: "LAB_ISSUE_ASSIGNED", audience: { mode: "USER_IDS", userIds: [2] } });

    await parity(seed, (lab) => lab.assignIssue(1, 999));
    await parity(seed, (lab) => lab.assignIssue(999, 2));
    await parity(seed, (lab) => lab.unassignIssue(1));
    await parity(seed, (lab) => lab.startIssueProgress(1)); // resolved -> erro
    await parity(
      () => {
        seed();
        labHarness.world.issues[0].status = "open";
      },
      (lab) => lab.startIssueProgress(1),
    );
    await parity(seed, (lab) => lab.resolveIssue(1, "troquei o papel")); // resolved -> re-resolve idempotente
    await parity(seed, (lab) => lab.resolveIssue(1, "   ")); // blank -> erro
    await parity(
      () => {
        seed();
        labHarness.world.issues[0].status = "closed";
      },
      (lab) => lab.resolveIssue(1, undefined),
    );
    await parity(seed, (lab) => lab.closeIssue(1));
    await parity(
      () => {
        seed();
        labHarness.world.issues[0].status = "closed";
      },
      (lab) => lab.closeIssue(1),
    );
    await parity(seed, (lab) => lab.reopenIssue(1)); // resolved -> erro
    await parity(
      () => {
        seed();
        labHarness.world.issues[0].status = "closed";
      },
      (lab) => lab.reopenIssue(1),
    );
  });
});

describe("contract lab — events/notices", () => {
  it("listLabEventsByDate (janela dia local ASC) + listLabEventsByRange", async () => {
    const seed = () => {
      seedLabEvent({ date: new Date("2026-09-16T03:00:00.000Z") });
      seedLabEvent({ date: new Date("2026-09-16T15:00:00.000Z") });
      seedLabEvent({ date: new Date("2026-09-17T12:00:00.000Z") });
    };
    await parity(seed, (lab) => lab.listLabEventsByDate(new Date("2026-09-16T12:00:00.000Z")));
    await parity(seed, (lab) => lab.listLabEventsByRange({ startDate: new Date("2026-09-15T00:00:00.000Z"), endDate: new Date("2026-09-18T00:00:00.000Z") }));
  });

  it("createLabEvent: guardas + validação acumulada", async () => {
    const seed = () => {
      labHarness.seedUser({ status: "active" });
      labHarness.seedUser({ status: "inactive" });
    };
    await parity(seed, (lab) => lab.createLabEvent({ userId: 1, userName: "U1", date: new Date("2026-09-16T12:00:00.000Z"), note: "reunião" }));
    await parity(seed, (lab) => lab.createLabEvent({ userId: 2, userName: "U2", date: new Date("2026-09-16T12:00:00.000Z"), note: "x" }));
    await parity(seed, (lab) => lab.createLabEvent({ userId: 999, userName: "X", date: new Date("2026-09-16T12:00:00.000Z"), note: "x" }));
    await parity(seed, (lab) => lab.createLabEvent({ userId: 1, userName: " ", date: new Date("nope"), note: "  " }));
  });

  it("updateLabEvent/deleteLabEvent: escada de acesso 8L9 na ordem exata + validação solta", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["LABORATORISTA"] }); // 1
      labHarness.seedUser({ roles: ["GERENTE"] }); // 2
      labHarness.seedUser({ roles: ["VOLUNTARIO"] }); // 3
      labHarness.seedUser({ roles: ["LABORATORISTA"] }); // 4
      seedLabEvent({ userId: 2 }); // evento do GERENTE
      seedLabEvent({ userId: 3 }); // evento do VOLUNTARIO
      seedLabEvent({ userId: 999 }); // dono não existe
    };
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 1, actorUserId: 2, actorRoles: ["GERENTE"], note: "dono ok" }));
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 1, actorUserId: 1, actorRoles: ["LABORATORISTA"], note: "menor" })); // priority
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 2, actorUserId: 3, actorRoles: ["VOLUNTARIO"], note: "sem papel" })); // dono ok
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 2, actorUserId: 1, actorRoles: ["LABORATORISTA"], date: new Date("2026-09-17T12:00:00.000Z") })); // maior -> ok
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 3, actorUserId: 1, actorRoles: ["LABORATORISTA"], note: "x" })); // alvo inexistente
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 2, actorUserId: 999, actorRoles: ["GERENTE"], note: "x" })); // ator inexistente
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 999, actorUserId: 3, actorRoles: ["VOLUNTARIO"], note: "x" })); // evento inexistente
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 2, actorUserId: 3, actorRoles: ["VOLUNTARIO"], date: new Date("nope") }));
    await parity(seed, (lab) => lab.updateLabEvent({ eventId: 2, actorUserId: 3, actorRoles: ["VOLUNTARIO"], note: "  " }));

    await parity(seed, (lab) => lab.deleteLabEvent({ eventId: 1, actorUserId: 1, actorRoles: ["LABORATORISTA"] }));
    await parity(seed, (lab) => lab.deleteLabEvent({ eventId: 2, actorUserId: 1, actorRoles: ["LABORATORISTA"] }));
    await parity(seed, (lab) => lab.deleteLabEvent({ eventId: 2, actorUserId: 3, actorRoles: ["VOLUNTARIO"] }));
  });

  it("notices: list/create/delete (QUIRK-8L1) + acesso", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["LABORATORISTA"] }); // 1
      labHarness.seedUser({ roles: ["GERENTE"] }); // 2
      labHarness.seedUser({ roles: ["VOLUNTARIO"] }); // 3
      seedNotice({ performedBy: 2, description: "aviso do gerente", userName: "Gerente" });
      seedNotice({ performedBy: 3, description: "aviso do voluntario", userName: "Vol" });
    };
    await parity(seed, (lab) => lab.listLabNotices());
    await parity(seed, (lab) => lab.createLabNotice({ userId: 1, userName: "Lab", note: " novo aviso " }));
    await parity(seed, (lab) => lab.createLabNotice({ userId: 1, userName: "Lab", note: "   " }));
    await parity(seed, (lab) => lab.createLabNotice({ userId: 999, userName: "X", note: "x" }));
    await parity(seed, (lab) => lab.deleteLabNotice({ noticeId: 1, actorUserId: 1, actorRoles: ["LABORATORISTA"] })); // priority
    await parity(seed, (lab) => lab.deleteLabNotice({ noticeId: 2, actorUserId: 1, actorRoles: ["LABORATORISTA"] })); // maior -> ok
    await parity(seed, (lab) => lab.deleteLabNotice({ noticeId: 2, actorUserId: 3, actorRoles: ["VOLUNTARIO"] })); // dono
    await parity(seed, (lab) => lab.deleteLabNotice({ noticeId: 999, actorUserId: 3, actorRoles: ["VOLUNTARIO"] }));
  });
});

describe("contract lab — schedules", () => {
  it("laboratory schedules: list + create (permissão/validação) + update 8L12 + delete", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["LABORATORISTA"] }); // 1
      labHarness.seedUser({ roles: ["VOLUNTARIO"] }); // 2
      seedLabSchedule({ dayOfWeek: 2, startTime: "14:00", endTime: "18:00", notes: "tarde" });
      seedLabSchedule({ dayOfWeek: 1, startTime: "08:00", endTime: "12:00", notes: "manha" });
    };
    await parity(seed, (lab) => lab.listLaboratorySchedules());
    await parity(seed, (lab) => lab.createLaboratorySchedule({ dayOfWeek: 3, startTime: "08:00", endTime: "12:00", notes: "n", userId: 1 }));
    await parity(seed, (lab) => lab.createLaboratorySchedule({ dayOfWeek: 3, startTime: "08:00", endTime: "12:00", userId: 2 })); // sem papel
    await parity(seed, (lab) => lab.createLaboratorySchedule({ dayOfWeek: 7, startTime: "25:00", endTime: "12:00", userId: 1 })); // validação
    await parity(seed, (lab) => lab.updateLaboratorySchedule(1, { dayOfWeek: 5, startTime: "15:00", notes: "", userId: 1 })); // 8L12
    await parity(seed, (lab) => lab.updateLaboratorySchedule(1, { dayOfWeek: 5, userId: 1 })); // sem branch
    await parity(seed, (lab) => lab.updateLaboratorySchedule(1, { startTime: "25:00", userId: 1 })); // validacao MESCLADA do repo legado
    await parity(seed, (lab) => lab.updateLaboratorySchedule(1, { endTime: "07:00", userId: 1 })); // ordem inicio<fim no merge
    await parity(seed, (lab) => lab.updateLaboratorySchedule(999, { startTime: "09:00", userId: 1 }));
    await parity(seed, (lab) => lab.updateLaboratorySchedule(1, { startTime: "09:00", userId: 2 })); // sem papel
    await parity(seed, (lab) => lab.deleteLaboratorySchedule({ scheduleId: 1, userId: 1 }));
    await parity(seed, (lab) => lab.deleteLaboratorySchedule({ scheduleId: 1, userId: 2 }));
    await parity(seed, (lab) => lab.deleteLaboratorySchedule({ scheduleId: 999, userId: 1 }));
  });

  it("user schedules: leitura aberta + escrita MANAGE_USERS + 8L13 + replace cru", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["COORDENADOR"] }); // 1 (MANAGE_USERS)
      labHarness.seedUser({ roles: ["VOLUNTARIO"] }); // 2
      seedUserSchedule({ userId: 2, dayOfWeek: 1, startTime: "08:00", endTime: "12:00" });
      seedUserSchedule({ userId: 1, dayOfWeek: 3, startTime: "14:00", endTime: "18:00" });
    };
    await parity(seed, (lab) => lab.listUserSchedules({ actorUserId: 2, actorRoles: ["VOLUNTARIO"] })); // leitura aberta
    await parity(seed, (lab) => lab.listUserSchedules({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], targetUserId: 2 }));
    await parity(seed, (lab) => lab.getUserSchedule(1));
    await parity(seed, (lab) => lab.getUserSchedule(999));
    await parity(seed, (lab) => lab.createUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], targetUserId: 2, dayOfWeek: 2, startTime: "09:00", endTime: "11:00" }));
    await parity(seed, (lab) => lab.createUserSchedule({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], targetUserId: 2, dayOfWeek: 2, startTime: "09:00", endTime: "11:00" })); // Acesso negado
    await parity(seed, (lab) => lab.createUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], targetUserId: 999, dayOfWeek: 2, startTime: "09:00", endTime: "11:00" }));
    await parity(seed, (lab) => lab.createUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], targetUserId: 2, dayOfWeek: 7, startTime: "11:00", endTime: "09:00" })); // validação
    await parity(seed, (lab) => lab.updateUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], scheduleId: 1, dayOfWeek: 5, endTime: "13:00" })); // 8L13
    await parity(seed, (lab) => lab.updateUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], scheduleId: 1, endTime: "25:00" })); // validacao MESCLADA do repo legado
    await parity(seed, (lab) => lab.updateUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], scheduleId: 999, endTime: "13:00" }));
    await parity(seed, (lab) => lab.deleteUserSchedule({ actorUserId: 1, actorRoles: ["COORDENADOR"], scheduleId: 1 }));
    await parity(seed, (lab) => lab.deleteUserSchedule({ actorUserId: 2, actorRoles: ["VOLUNTARIO"], scheduleId: 1 }));
    await parity(seed, (lab) =>
      lab.replaceUserSchedules({
        actorUserId: 1,
        actorRoles: ["COORDENADOR"],
        targetUserId: 2,
        slots: [
          { dayOfWeek: 9, startTime: "99:99", endTime: "aa" }, // cru — sem validação (8L13)
          { dayOfWeek: 4, startTime: "10:00", endTime: "16:00" },
        ],
      }),
    );
  });
});

describe("contract lab — responsibilities", () => {
  it("list: all/activeOnly/range OVERLAP (8L10)", async () => {
    const seed = () => {
      seedResponsibility({ userId: 1, startTime: "2026-09-16T10:00:00.000Z" }); // ativa
      seedResponsibility({ userId: 2, startTime: "2026-09-10T10:00:00.000Z", endTime: "2026-09-11T10:00:00.000Z" }); // fora do range
      seedResponsibility({ userId: 3, startTime: "2026-09-14T10:00:00.000Z", endTime: "2026-09-16T20:00:00.000Z" }); // overlap
    };
    await parity(seed, (lab) => lab.listResponsibilities());
    await parity(seed, (lab) => lab.listResponsibilities({ activeOnly: true }));
    await parity(seed, (lab) => lab.listResponsibilities({ startDate: new Date("2026-09-15T00:00:00.000Z"), endDate: new Date("2026-09-17T00:00:00.000Z") }));
  });

  it("startResponsibility: gate de papel + ativa global + happy", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["LABORATORISTA"] });
      labHarness.seedUser({ roles: ["VOLUNTARIO"] });
    };
    await parity(seed, (lab) => lab.startResponsibility({ actorUserId: 1, actorName: "Lab guy", notes: "manhã" }));
    await parity(seed, (lab) => lab.startResponsibility({ actorUserId: 2, actorName: "Vol" })); // sem papel
    await parity(seed, (lab) => lab.startResponsibility({ actorUserId: 999, actorName: "X" })); // usuário não encontrado
    await parity(
      () => {
        seed();
        seedResponsibility({ userId: 2 });
      },
      (lab) => lab.startResponsibility({ actorUserId: 1, actorName: "Lab guy" }),
    ); // ativa GLOBAL (de outro usuário) bloqueia
  });

  it("canEnd/end/notes/delete (8L11)", async () => {
    const seed = () => {
      labHarness.seedUser({ roles: ["LABORATORISTA"] }); // 1
      labHarness.seedUser({ roles: ["VOLUNTARIO"] }); // 2
      seedResponsibility({ userId: 2, notes: "originais" });
    };
    await parity(seed, (lab) => lab.canEndResponsibility(2, 1)); // dono
    await parity(seed, (lab) => lab.canEndResponsibility(1, 1)); // papel lab
    await parity(seed, (lab) => lab.canEndResponsibility(1, 999)); // inexistente
    await parity(seed, (lab) => lab.endResponsibility(1, undefined)); // notes falsy preserva
    await parity(seed, (lab) => lab.endResponsibility(1, "novas"));
    await parity(seed, (lab) => lab.endResponsibility(1, "")); // preserva
    await parity(
      () => {
        seed();
        labHarness.world.responsibilities[0].endTime = "2026-09-16T11:00:00.000Z";
      },
      (lab) => lab.endResponsibility(1, undefined),
    ); // já finalizada
    await parity(seed, (lab) => lab.endResponsibility(999, undefined));
    await parity(seed, (lab) => lab.updateResponsibilityNotes(1, 2, "  editado  "));
    await parity(seed, (lab) => lab.updateResponsibilityNotes(1, 2, "   ")); // trim -> null
    await parity(
      () => {
        seed();
        labHarness.world.responsibilities[0].userId = 999; // ator comum não é dono nem lab manager? (1 é LABORATORISTA -> pode)
      },
      (lab) => lab.updateResponsibilityNotes(1, 2, "x"),
    ); // 2 é VOLUNTARIO em responsabilidade alheia -> Acesso negado
    await parity(seed, (lab) => lab.deleteResponsibility(1));
    await parity(seed, (lab) => lab.deleteResponsibility(999));
  });

  it("pause/resume (8L15): no-op quando já pausada; totalPausedMs acumula", async () => {
    const seed = () => {
      seedResponsibility({ userId: 1 });
    };
    await parity(seed, (lab) => lab.pauseResponsibilityForUser(1));
    await parity(
      () => {
        seed();
        labHarness.world.responsibilities[0].pausedAt = "2026-09-16T11:00:00.000Z";
      },
      (lab) => lab.pauseResponsibilityForUser(1),
    ); // no-op
    await parity(seed, (lab) => lab.pauseResponsibilityForUser(999)); // sem ativa
    await parity(seed, (lab) => lab.resumeResponsibilityForUser(1)); // não pausada -> null
    await parity(
      () => {
        seed();
        labHarness.world.responsibilities[0].pausedAt = "2026-09-16T11:59:55.000Z";
      },
      (lab) => lab.resumeResponsibilityForUser(1),
    ); // +5000ms
    await parity(
      () => {
        seed();
        labHarness.world.responsibilities[0].pausedAt = "2026-09-16T11:59:55.000Z";
        labHarness.world.responsibilities[0].totalPausedMs = 1000;
      },
      (lab) => lab.resumeResponsibilityForUser(1),
    ); // acumula 1000+5000
  });
});
