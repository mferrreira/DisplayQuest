import {
  activityPeriod,
  applyXpFloor,
  civilDayOfInstant,
  civilDaysBetween,
  daysLateForTask,
  eloForSeasonXp,
  startOfCivilDayInstant,
  weeklyXpReviewDescription,
  XP_GAMIFICATION_TRACK,
} from "@/backend/domain";
import type {
  WeeklyReviewCandidate,
  WeeklyXpApplyResult,
  WeeklyXpReviewPort,
  WeeklyXpWindow,
  WeeklyXpReviewWrite,
} from "@/backend/modules/gamification/application/ports/weekly-xp-review.port";
import { prisma } from "@/lib/database/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * PrismaWeeklyXpReviewPort — plan-v8 V8-3 (DEC-214). Só FATOS: as contagens da semana, com as
 * condições que o sistema já usa para creditar. Toda aritmética (boost, substituição, penalidade,
 * piso) está em `xp-rules.ts` e é aplicada pelo use case.
 *
 * As escolhas de contagem, todas medidas e todas congeladas no roundtrip da onda:
 *
 *   - **sessão da semana**: `status: "completed"` e `startTime` na janela — a mesma convenção da
 *     leitura de horas (`prisma-hours-read.repository.ts`). Constância conta DIAS CIVIS distintos
 *     (dois trechos no mesmo dia são um dia), e horas somam `duration` dos trechos da semana.
 *   - **tarefas da semana**: as duas famílias de `users.completedTasks` (V8-2). Atrasada é a que
 *     `daysLateForTask` chama de atrasada — a MESMA régua do prêmio (DEC-97), não uma segunda.
 *   - **atividades da semana**: as linhas de award do próprio ledger (`action GAMIFICATION_AWARD`,
 *     `newValues.sourceType = ACTIVITY_COMPLETED`) criadas na janela, deduplicadas por atividade.
 *     É a lista Hamilton de DEC-164 já materializada: quem recebeu distribuição tem linha; quem não
 *     recebeu não tem credit de +20 e também não paga −20/−30. Atrasa é medido contra o `periodoFim`
 *     derivado (`activityPeriod`), a mesma régua do prêmio da atividade (DEC-103).
 *   - **sessão no período da atividade**: trecho concluído que SOLAPA o período da linha
 *     (`firstMonth`/`lastMonth` → `activityPeriod`), do mesmo projeto da atividade ou sem projeto
 *     declarado. Sessão de outro projeto não conta como presença nesta etapa.
 *
 * `applyWeeklyXpAdjustment` escreve as duas coisas num único `$transaction` e reconfere a chave de
 * reexecução DENTRO da transação: a linha existe, nada é escrito. O piso é aplicado aqui, sobre o
 * XP lido dentro da mesma transação (`applyXpFloor`) — nunca sobre um valor lido antes.
 */
export function createPrismaWeeklyXpReviewPort(): WeeklyXpReviewPort {
  return {
    async listUsersForWeeklyReview() {
      const rows = await prisma.users.findMany({
        select: { id: true, name: true, xp: true, weekHours: true, elo: true },
        orderBy: { id: "asc" },
      });
      return rows.map<WeeklyReviewCandidate>((row) => ({
        userId: row.id,
        name: row.name,
        xp: row.xp,
        weekHoursGoal: row.weekHours,
        elo: row.elo,
      }));
    },

    async hasWeeklyReview(userId, weekStart) {
      const existing = await prisma.history.findFirst({
        where: {
          entityType: "USER",
          entityId: userId,
          action: "GAMIFICATION_AWARD",
          description: weeklyXpReviewDescription(userId, weekStart),
        },
        select: { id: true },
      });
      return Boolean(existing);
    },

    async getWeeklyFacts(userId, { start, endExclusive }: WeeklyXpWindow) {
      const [sessions, delegatedTasks, progressRows, awardRows] = await Promise.all([
        prisma.work_sessions.findMany({
          where: { userId, status: "completed", startTime: { gte: start, lt: endExclusive } },
          select: { startTime: true, duration: true },
        }),
        prisma.tasks.findMany({
          where: {
            assignedTo: userId,
            completedAt: { gte: start, lt: endExclusive },
            isGlobal: false,
            taskVisibility: { not: "public" },
          },
          select: { id: true, dueDate: true, completedAt: true },
        }),
        prisma.task_user_progress.findMany({
          where: { userId, completedAt: { gte: start, lt: endExclusive } },
          select: { completedAt: true, task: { select: { dueDate: true } } },
        }),
        prisma.history.findMany({
          where: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            performedAt: { gte: start, lt: endExclusive },
          },
          select: { newValues: true, performedAt: true },
        }),
      ]);

      const sessionDays = new Set(sessions.map((session) => civilDayOfInstant(session.startTime)));
      const hoursWorked = sessions.reduce((total, session) => total + (session.duration ?? 0), 0);

      const taskRows = [
        ...delegatedTasks.map((task) => ({ dueDate: task.dueDate, completedAt: task.completedAt })),
        ...progressRows.map((progress) => ({
          dueDate: progress.task.dueDate,
          completedAt: progress.completedAt,
        })),
      ];
      const tasksApproved = taskRows.length;
      const tasksLate = taskRows.filter(
        (row) => row.completedAt !== null && daysLateForTask({ dueDate: row.dueDate }, row.completedAt) > 0,
      ).length;

      const { activitiesLate, activitiesWithoutSession } = await countActivityPenalties(userId, awardRows);

      return {
        daysWithSession: sessionDays.size,
        tasksApproved,
        tasksLate,
        activitiesLate,
        activitiesWithoutSession,
        hoursWorked,
      };
    },

    async applyWeeklyXpAdjustment({ userId, weekStart, description, adjustments, netAmount }): Promise<WeeklyXpApplyResult> {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.history.findFirst({
          where: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            description,
          },
          select: { id: true },
        });
        if (existing) return { applied: false, xpBefore: 0, xpAfter: 0, eloBefore: "", eloAfter: "" };

        const user = await tx.users.findUnique({ where: { id: userId }, select: { xp: true, elo: true } });
        if (!user) return { applied: false, xpBefore: 0, xpAfter: 0, eloBefore: "", eloAfter: "" };

        const xpAfter = applyXpFloor(user.xp, netAmount);
        const eloAfter = eloForSeasonXp(xpAfter);

        await tx.history.create({
          data: {
            entityType: "USER",
            entityId: userId,
            action: "GAMIFICATION_AWARD",
            performedBy: userId,
            description,
            track: XP_GAMIFICATION_TRACK,
            oldValues: { xp: user.xp },
            newValues: {
              weekStart,
              adjustments,
              netAmount,
              xpBefore: user.xp,
              xpAfter,
            },
            metadata: {
              domain: "gamification",
              sourceType: "WEEKLY_XP_REVIEW",
              sourceId: weekStart,
              xpAwarded: netAmount,
            },
          },
        });

        await tx.users.update({ where: { id: userId }, data: { xp: xpAfter, elo: eloAfter } });

        return { applied: true, xpBefore: user.xp, xpAfter, eloBefore: user.elo, eloAfter };
      });
    },
  };
}

interface AwardLedgerRow {
  newValues: unknown;
  performedAt: Date;
}

/**
 * Das linhas de award da semana, as duas penalidades de atividade: atrasada (−20) e sem sessão do
 * membro no período da linha (−30). Dedup por atividade: o ledger tem uma linha por trilha
 * (POINTS e XP) para a MESMA atividade, e a penalidade é uma por atividade, não duas.
 */
async function countActivityPenalties(
  userId: number,
  awardRows: AwardLedgerRow[],
): Promise<{ activitiesLate: number; activitiesWithoutSession: number }> {
  const activityIds = new Set<number>();
  const approvedAtOf = new Map<number, Date>();

  for (const row of awardRows) {
    const values = (row.newValues ?? {}) as { sourceType?: unknown; sourceId?: unknown };
    if (values.sourceType !== "ACTIVITY_COMPLETED") continue;
    if (typeof values.sourceId !== "number") continue;
    if (!activityIds.has(values.sourceId)) {
      activityIds.add(values.sourceId);
      approvedAtOf.set(values.sourceId, row.performedAt);
    }
  }

  if (activityIds.size === 0) return { activitiesLate: 0, activitiesWithoutSession: 0 };

  const activities = await prisma.project_activities.findMany({
    where: { id: { in: [...activityIds] } },
    select: { id: true, projectId: true, firstMonth: true, lastMonth: true, approvedAt: true },
  });

  let activitiesLate = 0;
  let activitiesWithoutSession = 0;

  for (const activity of activities) {
    const { periodoInicio, periodoFim } = activityPeriod(activity.firstMonth, activity.lastMonth);
    const approvedInstant = activity.approvedAt ?? approvedAtOf.get(activity.id)!;

    if (civilDaysBetween(periodoFim, civilDayOfInstant(approvedInstant)) > 0) {
      activitiesLate += 1;
    }

    const sessionsInPeriod = await prisma.work_sessions.count({
      where: {
        userId,
        status: "completed",
        startTime: { lt: endOfCivilDay(periodoFim) },
        AND: [
          { OR: [{ endTime: null }, { endTime: { gte: startOfCivilDay(periodoInicio) } }] },
          { OR: [{ projectId: activity.projectId }, { projectId: null }] },
        ],
      },
    });

    if (sessionsInPeriod === 0) activitiesWithoutSession += 1;
  }

  return { activitiesLate, activitiesWithoutSession };
}

/**
 * Os instantâneos do período civil de uma linha do cronograma: meia-noite de America/Sao_Paulo no
 * primeiro dia, e a meia-noite seguinte ao último dia (corte exclusivo — a mesma escolha do mês e
 * da semana). Ancorados no meio-dia UTC de cada dia, o truque que faz o dia civil sair certo.
 */
function startOfCivilDay(civilDay: string): Date {
  const [year, month, day] = civilDay.split("-").map(Number);
  return startOfCivilDayInstant(new Date(Date.UTC(year, month - 1, day, 12)));
}

function endOfCivilDay(civilDay: string): Date {
  const [year, month, day] = civilDay.split("-").map(Number);
  return startOfCivilDayInstant(new Date(Date.UTC(year, month - 1, day, 12) + DAY_MS));
}
