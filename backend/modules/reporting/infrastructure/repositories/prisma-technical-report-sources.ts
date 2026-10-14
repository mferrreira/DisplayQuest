import { prisma } from "@/lib/database/prisma"
import { civilDayOfInstant, type ReportDraftActivityRow, type ReportDraftSessionRow, type ReportDraftTaskRow } from "@/backend/domain"
import type { TechnicalReportSourcesPort } from "@/backend/modules/reporting/application/ports/technical-report-sources.port"

/**
 * PrismaTechnicalReportSources — as três fontes do rascunho por adaptador próprio do
 * módulo de reporting (RG-04, V5-9c).
 *
 * A janela de sessão é a do período do relatório (DEC-167): `startTime` entre o início
 * e o fim civis escolhidos, com as bordas em UTC do dia civil — para contexto de rascunho
 * a precisão de fuso na borda não decide nada, e o teste usa datas claramente dentro
 * e fora. Cronograma: a atividade entra quando seu intervalo de meses CRUZA o período
 * (comparação lexicográfica de `AAAA-MM`, DEC-156).
 */
export class PrismaTechnicalReportSources implements TechnicalReportSourcesPort {
  async listSessionLogs(projectId: number, from: string, to: string): Promise<ReportDraftSessionRow[]> {
    const sessions = await prisma.work_sessions.findMany({
      where: {
        projectId,
        startTime: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T23:59:59.999Z`),
        },
      },
      orderBy: { startTime: "asc" },
      select: {
        startTime: true,
        userName: true,
        activity: true,
        duration: true,
        location: true,
      },
    })
    return sessions.map((session) => ({
      date: civilDayOfInstant(session.startTime),
      userName: session.userName,
      activity: session.activity,
      duration: session.duration,
      location: session.location,
    }))
  }

  async listProjectTasks(projectId: number): Promise<ReportDraftTaskRow[]> {
    const tasks = await prisma.tasks.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
      select: {
        title: true,
        status: true,
        completedAt: true,
        points: true,
      },
    })
    return tasks.map((task) => ({
      title: task.title,
      status: task.status,
      completedAt: task.completedAt ? civilDayOfInstant(task.completedAt) : null,
      points: task.points,
    }))
  }

  async listCronogramaActivities(
    projectId: number,
    fromMonth: string,
    toMonth: string,
  ): Promise<ReportDraftActivityRow[]> {
    const activities = await prisma.project_activities.findMany({
      where: {
        projectId,
        firstMonth: { lte: toMonth },
        lastMonth: { gte: fromMonth },
      },
      orderBy: { order: "asc" },
      select: {
        description: true,
        firstMonth: true,
        lastMonth: true,
        status: true,
        _count: { select: { files: true } },
      },
    })
    return activities.map((activity) => ({
      description: activity.description,
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
      status: activity.status,
      evidenceCount: activity._count.files,
    }))
  }
}