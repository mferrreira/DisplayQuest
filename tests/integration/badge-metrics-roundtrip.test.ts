// @vitest-environment node
/**
 * plan-v15 S03 (MODELO R2, aceitestodo da fatia) — o roundtrip G4 da porta de métricas
 * contra o banco de teste isolado 5433 (nunca 5432).
 *
 * O que este arquivo prova: cada métrica extra do registro é medida pela fonte REAL da
 * pessoa na tabela que a produz. O dado é criado pelo arquivo, com marcação própria
 * (stamp no nome/chave), e as asserções olham só para esse dado. Métricas de papel: o
 * usuário tem COORDENADOR, então `is_coordenador` é 1 e os outros papeis são 0.
 *
 * Cleanup em afterAll, na ordem das FKs: linhas bloqueantes primeiro (issues, anexos,
 * relatórios, compras), depois os cascades, por último o user.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/prisma";
import { METRIC_IDS, type MetricId } from "@/backend/domain";
import { createPrismaBadgeMetricsPort } from "@/backend/modules/gamification/infrastructure/repositories/prisma-badge-metrics.port";

const stamp = Date.now();
const metrics = createPrismaBadgeMetricsPort();

let userId = 0;
let projectId = 0;
let activityId = 0;
let closeId = 0;
let taskIds: number[] = [];
let attachmentIds: number[] = [];
let activityFileIds: number[] = [];
let certificateIds: number[] = [];
let reportIds: number[] = [];
let weeklyReportIds: number[] = [];
let issueIds: number[] = [];
let labEventIds: number[] = [];
let responsibilityIds: number[] = [];
let purchaseIds: number[] = [];
let rewardId = 0;
let sessionIds: number[] = [];
let weekHistoryIds: number[] = [];
let monthHistoryIds: number[] = [];

const EXTRA_IDS: MetricId[] = METRIC_IDS.filter((id) => !["tasks_completed", "points", "projects_joined", "work_sessions", "weekly_hours_avg", "streak_days"].includes(id));

describe("G4 roundtrip — métricas de badges (isolated test DB)", () => {
  beforeAll(async () => {
    const user = await prisma.users.create({
      data: {
        name: `S03 Ana ${stamp}`,
        email: `s03-metrics-ana-${stamp}@test.local`,
        password: "g4-dummy-hash",
        status: "active",
        roles: ["COORDENADOR"],
        weekHours: 10,
        cpf: "1112223334455",
        course: "Ciências",
        level: "GRADUACAO",
        bio: "tester",
      },
      select: { id: true },
    });
    userId = user.id;

    const project = await prisma.projects.create({
      data: {
        name: `S03 Projeto ${stamp}`,
        status: "active",
        createdAt: "2026-01-01",
        createdBy: userId,
        leaderId: userId,
      },
      select: { id: true },
    });
    projectId = project.id;

    // criadas pelo usuário (tasks_created)
    const createdTask = await prisma.tasks.create({
      data: { title: `S03 criada ${stamp}`, status: "to-do", priority: "medium", createdBy: userId },
      select: { id: true },
    });
    taskIds.push(createdTask.id);

    // mãe com subtasks, usuário responsável
    const mother = await prisma.tasks.create({
      data: { title: `S03 mãe ${stamp}`, status: "in-progress", priority: "medium", createdBy: userId },
      select: { id: true },
    });
    taskIds.push(mother.id);
    await prisma.task_assignees.create({ data: { taskId: mother.id, userId } });
    await prisma.task_subtasks.createMany({
      data: [
        { taskId: mother.id, title: "s1", completed: true },
        { taskId: mother.id, title: "s2", completed: true },
        { taskId: mother.id, title: "s3", completed: false },
      ],
    });

    await prisma.project_deliverables.createMany({
      data: [
        { projectId, name: "d1", quantity: 1 },
        { projectId, name: "d2", quantity: 2 },
      ],
    });
    await prisma.project_goals.createMany({
      data: [
        { projectId, order: 1, target: 2, description: "g1" },
        { projectId, order: 2, description: "g2" },
        { projectId, order: 3, description: "g3" },
      ],
    });

    const attachment = await prisma.project_attachments.create({
      data: {
        projectId,
        blobKey: `s03-${stamp}/att1.pdf`,
        name: "att1.pdf",
        contentType: "application/pdf",
        size: 10,
        uploadedBy: userId,
      },
      select: { id: true },
    });
    attachmentIds.push(attachment.id);

    const activity = await prisma.project_activities.create({
      data: {
        projectId,
        order: 1,
        description: `S03 etapa ${stamp}`,
        responsibleId: userId,
        firstMonth: "2026-01",
        lastMonth: "2026-02",
        status: "DONE",
        approvedBy: userId,
        requestedAt: new Date(),
      },
      select: { id: true },
    });
    activityId = activity.id;

    const activityFile = await prisma.project_activity_files.create({
      data: {
        activityId,
        blobKey: `s03-${stamp}/proof.pdf`,
        name: "proof.pdf",
        contentType: "application/pdf",
        size: 10,
        uploadedBy: userId,
      },
      select: { id: true },
    });
    activityFileIds.push(activityFile.id);

    await prisma.work_sessions.createMany({
      data: [
        { userId, userName: "S03 Ana", startTime: new Date(), duration: 3, status: "completed" },
        { userId, userName: "S03 Ana", startTime: new Date(), duration: 5, status: "completed" },
        { userId, userName: "S03 Ana", startTime: new Date(), status: "completed" },
      ],
    });
    const sessions = await prisma.work_sessions.findMany({ where: { userId }, select: { id: true } });
    sessionIds = sessions.map((s) => s.id);

    await prisma.weekly_hours_history.createMany({
      data: [
        { userId, userName: "S03 Ana", weekStart: new Date("2026-01-05"), weekEnd: new Date("2026-01-11"), totalHours: 10 },
        { userId, userName: "S03 Ana", weekStart: new Date("2026-01-12"), weekEnd: new Date("2026-01-18"), totalHours: 12 },
        { userId, userName: "S03 Ana", weekStart: new Date("2026-01-19"), weekEnd: new Date("2026-01-25"), totalHours: 8 },
      ],
    });
    const weeks = await prisma.weekly_hours_history.findMany({ where: { userId }, select: { id: true } });
    weekHistoryIds = weeks.map((w) => w.id);

    const reward = await prisma.rewards.create({ data: { name: `S03 reward ${stamp}`, price: 20, available: true }, select: { id: true } });
    rewardId = reward.id;
    await prisma.purchases.createMany({
      data: [
        { userId, rewardId, rewardName: `S03 reward ${stamp}`, price: 20, purchaseDate: "2026-10-01", status: "delivered" },
        { userId, rewardId, rewardName: `S03 reward ${stamp}`, price: 20, purchaseDate: "2026-10-02", status: "delivered" },
      ],
    });
    const purchases = await prisma.purchases.findMany({ where: { userId }, select: { id: true } });
    purchaseIds = purchases.map((p) => p.id);

    const report = await prisma.project_reports.create({
      data: {
        projectId,
        authorId: userId,
        periodType: "semanal",
        periodStart: new Date("2026-01-05"),
        periodEnd: new Date("2026-01-11"),
        content: "corpo",
      },
      select: { id: true },
    });
    reportIds.push(report.id);

    const weekly = await prisma.weekly_reports.create({
      data: { userId, userName: "S03 Ana", weekStart: new Date("2026-01-05"), weekEnd: new Date("2026-01-11"), totalLogs: 1 },
      select: { id: true },
    });
    weeklyReportIds.push(weekly.id);

    const certificate = await prisma.certificates.create({
      data: {
        projectId,
        userId,
        month: "2026-10",
        blobKey: `s03-${stamp}/cert.pdf`,
        fileName: "cert.pdf",
        generatedBy: userId,
      },
      select: { id: true },
    });
    certificateIds.push(certificate.id);

    const issue1 = await prisma.issues.create({ data: { title: "i1", description: "d", reporterId: userId }, select: { id: true } });
    const issue2 = await prisma.issues.create({
      data: { title: "i2", description: "d", reporterId: userId, assigneeId: userId, status: "resolved", resolvedAt: new Date() },
      select: { id: true },
    });
    const issue3 = await prisma.issues.create({
      data: { title: "i3", description: "d", reporterId: userId, assigneeId: userId },
      select: { id: true },
    });
    issueIds.push(issue1.id, issue2.id, issue3.id);

    await prisma.lab_events.createMany({
      data: [
        { userId, userName: "S03 Ana", date: new Date(), note: "e1" },
        { userId, userName: "S03 Ana", date: new Date(), note: "e2" },
      ],
    });
    const labEvents = await prisma.lab_events.findMany({ where: { userId }, select: { id: true } });
    labEventIds = labEvents.map((e) => e.id);

    await prisma.lab_responsibilities.createMany({
      data: [
        { userId, userName: "S03 Ana", startTime: "2026-01-05T08:00", endTime: "2026-01-05T12:00" },
        { userId, userName: "S03 Ana", startTime: "2026-01-06T08:00" },
      ],
    });
    const responsibilities = await prisma.lab_responsibilities.findMany({ where: { userId }, select: { id: true } });
    responsibilityIds = responsibilities.map((r) => r.id);

    const close = await prisma.board_month_closes.create({
      data: {
        month: "2098-01",
        track: "MONTH_POINTS",
        periodStart: new Date("2098-01-01T03:00:00Z"),
        periodEnd: new Date("2098-01-31T23:59:59Z"),
        closedAt: new Date(),
        triggeredBy: "SYSTEM:MONTH_CLOSE",
        peopleCount: 1,
      },
      select: { id: true },
    });
    closeId = close.id;
    await prisma.month_history.createMany({
      data: [
        { closeId, userId, userName: "S03 Ana", month: "2098-01", track: "MONTH_POINTS", value: 100, position: 1, periodStart: new Date("2098-01-01T03:00:00Z"), periodEnd: new Date("2098-01-31T23:59:59Z"), closedAt: new Date() },
        { closeId, userId, userName: "S03 Ana", month: "2098-02", track: "MONTH_POINTS", value: 50, position: 2, periodStart: new Date("2098-02-01T03:00:00Z"), periodEnd: new Date("2098-02-28T23:59:59Z"), closedAt: new Date() },
        { closeId, userId, userName: "S03 Ana", month: "2098-03", track: "MONTH_POINTS", value: 10, position: 4, periodStart: new Date("2098-03-01T03:00:00Z"), periodEnd: new Date("2098-03-31T23:59:59Z"), closedAt: new Date() },
      ],
    });
    const rows = await prisma.month_history.findMany({ where: { userId }, select: { id: true } });
    monthHistoryIds = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await prisma.month_history.deleteMany({ where: { id: { in: monthHistoryIds } } });
    await prisma.board_month_closes.deleteMany({ where: { id: closeId } });
    await prisma.issues.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.project_activity_files.deleteMany({ where: { id: { in: activityFileIds } } });
    await prisma.project_attachments.deleteMany({ where: { id: { in: attachmentIds } } });
    await prisma.certificates.deleteMany({ where: { id: { in: certificateIds } } });
    await prisma.project_reports.deleteMany({ where: { id: { in: reportIds } } });
    await prisma.weekly_reports.deleteMany({ where: { id: { in: weeklyReportIds } } });
    await prisma.purchases.deleteMany({ where: { id: { in: purchaseIds } } });
    await prisma.rewards.deleteMany({ where: { id: rewardId } });
    await prisma.lab_responsibilities.deleteMany({ where: { id: { in: responsibilityIds } } });
    await prisma.lab_events.deleteMany({ where: { id: { in: labEventIds } } });
    await prisma.weekly_hours_history.deleteMany({ where: { id: { in: weekHistoryIds } } });
    await prisma.work_sessions.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.task_assignees.deleteMany({ where: { userId } });
    await prisma.task_subtasks.deleteMany({ where: { taskId: { in: taskIds } } });
    await prisma.tasks.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.project_activities.deleteMany({ where: { id: activityId } });
    await prisma.project_deliverables.deleteMany({ where: { projectId } });
    await prisma.project_goals.deleteMany({ where: { projectId } });
    await prisma.project_members.deleteMany({ where: { projectId } });
    await prisma.projects.deleteMany({ where: { id: projectId } });
    await prisma.users.deleteMany({ where: { id: userId } });
  });

  it("mede todas as métricas extras pela fonte real da pessoa", async () => {
    const values = await metrics.computeValues(userId, EXTRA_IDS);
    expect(values).toMatchObject({
      tasks_created: 2,
      subtasks_completed: 2,
      projects_led: 1,
      deliverables_added: 2,
      goals_defined: 3,
      attachments_uploaded: 1,
      activity_evidence_uploaded: 1,
      activities_responsible: 1,
      activities_completed: 1,
      sessions_hours_total: 8,
      weeks_perfect: 2,
      purchases_count: 2,
      points_spent: 40,
      reports_written: 1,
      weekly_reports_count: 1,
      certificates_generated: 1,
      certificate_months: 1,
      issues_reported: 3,
      issues_resolved: 1,
      lab_events_count: 2,
      lab_responsibilities_completed: 1,
      months_active: 3,
      months_top3: 2,
      months_won: 1,
      profile_fields_filled: 4,
      is_coordenador: 1,
      is_gerente: 0,
      is_laboratorista: 0,
      is_gerente_projeto: 0,
    });
  });
});
