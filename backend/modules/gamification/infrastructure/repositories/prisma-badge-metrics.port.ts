import { prisma } from "@/lib/database/prisma"
import { averageWeeklyHoursFrom, maxConsecutiveDaysFrom } from "@/backend/domain"
import type { MetricId } from "@/backend/domain"
import type { BadgeMetricsPort } from "@/backend/modules/gamification/application/ports/badge-metrics.port"

/**
 * plan-v15 S03 (MODELO R2): o adaptador Prisma da porta de métricas. Cada métrica do
 * registro é uma contagem/soma sobre a tabela que a produz; a fonte da contagem é a
 * autoridade REAL da pessoa naquela tabela (uploadedBy, approvedBy, authorId, roles),
 * nunca projeção de lista. Métricas de papel devolvem 0/1.
 *
 * plan-v15 S10 (R7): as 6 métricas-base do caminho legado (tasks_completed, points,
 * projects_joined, work_sessions, weekly_hours_avg, streak_days) também são medidas aqui,
 * com as MESMAS consultas congeladas do `createPrismaUserStatsPort` — o progresso "X de Y"
 * lê os 35 ids pela mesma porta, sem segunda fonte de contagem.
 */

const PROFILE_FIELDS = [
  "cpf",
  "registrationNumber",
  "course",
  "scholarshipType",
  "fundingAgency",
  "fundingAgencyOther",
  "level",
  "bio",
  "avatar",
  "avatarKey",
  "bannerKey",
] as const

export function createPrismaBadgeMetricsPort(): BadgeMetricsPort {
  return {
    async computeValues(userId, ids) {
      const user = await prisma.users.findUnique({
        where: { id: userId },
        select: {
          roles: true,
          weekHours: true,
          completedTasks: true,
          points: true,
          cpf: true,
          registrationNumber: true,
          course: true,
          scholarshipType: true,
          fundingAgency: true,
          fundingAgencyOther: true,
          level: true,
          bio: true,
          avatar: true,
          avatarKey: true,
          bannerKey: true,
        },
      })
      if (!user) return {}

      const values: Partial<Record<MetricId, number>> = {}
      for (const id of ids) {
        switch (id) {
          case "tasks_completed":
            values[id] = user.completedTasks
            break
          case "points":
            values[id] = user.points
            break
          case "projects_joined":
            values[id] = await prisma.project_members.count({ where: { userId } })
            break
          case "work_sessions":
            values[id] = await prisma.work_sessions.count({ where: { userId } })
            break
          case "weekly_hours_avg": {
            const samples = await prisma.weekly_hours_history.findMany({
              where: { userId },
              orderBy: { weekStart: "desc" },
              take: 4,
            })
            values[id] = averageWeeklyHoursFrom(samples.map((row) => ({ totalHours: row.totalHours })))
            break
          }
          case "streak_days": {
            const dates = await prisma.daily_logs.findMany({
              where: { userId },
              orderBy: { date: "asc" },
            })
            values[id] = maxConsecutiveDaysFrom(dates.map((row) => row.date))
            break
          }
          case "tasks_created":
            values[id] = await prisma.tasks.count({ where: { createdBy: userId } })
            break
          case "subtasks_completed":
            values[id] = await prisma.task_subtasks.count({
              where: { completed: true, task: { assignees: { some: { userId } } } },
            })
            break
          case "projects_led":
            values[id] = await prisma.projects.count({ where: { leaderId: userId } })
            break
          case "deliverables_added":
            values[id] = await prisma.project_deliverables.count({ where: { project: { createdBy: userId } } })
            break
          case "goals_defined":
            values[id] = await prisma.project_goals.count({ where: { project: { createdBy: userId } } })
            break
          case "attachments_uploaded":
            values[id] = await prisma.project_attachments.count({ where: { uploadedBy: userId } })
            break
          case "activity_evidence_uploaded":
            values[id] = await prisma.project_activity_files.count({ where: { uploadedBy: userId } })
            break
          case "activities_responsible":
            values[id] = await prisma.project_activities.count({ where: { responsibleId: userId } })
            break
          case "activities_completed":
            values[id] = await prisma.project_activities.count({ where: { status: "DONE", approvedBy: userId } })
            break
          case "sessions_hours_total": {
            const agg = await prisma.work_sessions.aggregate({ where: { userId }, _sum: { duration: true } })
            values[id] = agg._sum.duration ?? 0
            break
          }
          case "weeks_perfect":
            values[id] = await prisma.weekly_hours_history.count({
              where: { userId, totalHours: { gte: user.weekHours } },
            })
            break
          case "purchases_count":
            values[id] = await prisma.purchases.count({ where: { userId } })
            break
          case "points_spent": {
            const agg = await prisma.purchases.aggregate({ where: { userId }, _sum: { price: true } })
            values[id] = agg._sum.price ?? 0
            break
          }
          case "reports_written":
            values[id] = await prisma.project_reports.count({ where: { authorId: userId } })
            break
          case "weekly_reports_count":
            values[id] = await prisma.weekly_reports.count({ where: { userId } })
            break
          case "certificates_generated":
            values[id] = await prisma.certificates.count({ where: { generatedBy: userId } })
            break
          case "certificate_months":
            values[id] = await prisma.certificates.count({ where: { userId } })
            break
          case "issues_reported":
            values[id] = await prisma.issues.count({ where: { reporterId: userId } })
            break
          case "issues_resolved":
            values[id] = await prisma.issues.count({ where: { assigneeId: userId, resolvedAt: { not: null } } })
            break
          case "lab_events_count":
            values[id] = await prisma.lab_events.count({ where: { userId } })
            break
          case "lab_responsibilities_completed":
            values[id] = await prisma.lab_responsibilities.count({ where: { userId, endTime: { not: null } } })
            break
          case "months_active":
            values[id] = await prisma.month_history.count({ where: { userId } })
            break
          case "months_top3":
            values[id] = await prisma.month_history.count({ where: { userId, position: { lte: 3 } } })
            break
          case "months_won":
            values[id] = await prisma.month_history.count({ where: { userId, position: 1 } })
            break
          case "profile_fields_filled":
            values[id] = PROFILE_FIELDS.reduce((count, field) => (user[field] != null ? count + 1 : count), 0)
            break
          case "is_coordenador":
            values[id] = user.roles.includes("COORDENADOR") ? 1 : 0
            break
          case "is_gerente":
            values[id] = user.roles.includes("GERENTE") ? 1 : 0
            break
          case "is_laboratorista":
            values[id] = user.roles.includes("LABORATORISTA") ? 1 : 0
            break
          case "is_gerente_projeto":
            values[id] = user.roles.includes("GERENTE_PROJETO") ? 1 : 0
            break
        }
      }
      return values
    },
  }
}
