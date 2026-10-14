/**
 * PrismaActivityOverdueScanPort — adaptador da varredura de atraso (V5-8, DEC-64).
 *
 * I/O apenas: o filtro de vencimento é a regra pura do domínio no use case. Aqui só se
 * entrega o candidato (status não-concluído, nunca-notificado, com o projeto junto para
 * nome + líder) e se marca a linha notificada. A leitura de `users` é por adaptador
 * próprio do módulo de projeto (RG-04, mesmo desenho do `ProjectHoursPort`).
 */
import { prisma } from "@/lib/database/prisma"
import type {
  ActivityOverdueScanPort,
  OverdueActivityCandidate,
} from "@/backend/modules/project-management/application/ports/activity-overdue-scan.port"

/** Status que ainda podem "atrasar": DONE não atrasa, e o scan não notifica duas vezes. */
const NOTIFIABLE_STATUSES = ["OPEN", "COMPLETION_REQUESTED"] as const

export class PrismaActivityOverdueScanPort implements ActivityOverdueScanPort {
  async listNotificationCandidates(): Promise<OverdueActivityCandidate[]> {
    const rows = await prisma.project_activities.findMany({
      where: {
        status: { in: [...NOTIFIABLE_STATUSES] },
        overdueNotifiedAt: null,
      },
      select: {
        id: true,
        description: true,
        firstMonth: true,
        lastMonth: true,
        project: { select: { name: true, leaderId: true } },
      },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      firstMonth: row.firstMonth,
      lastMonth: row.lastMonth,
      projectName: row.project.name,
      leaderId: row.project.leaderId,
    }))
  }

  async markOverdueNotified(activityIds: number[], notifiedAt: Date): Promise<number> {
    if (activityIds.length === 0) return 0
    const result = await prisma.project_activities.updateMany({
      where: { id: { in: activityIds } },
      data: { overdueNotifiedAt: notifiedAt },
    })
    return result.count
  }

  async listGlobalManagerUserIds(): Promise<number[]> {
    const rows = await prisma.users.findMany({
      where: {
        status: "active",
        roles: { hasSome: ["COORDENADOR", "GERENTE"] },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => row.id)
  }
}

export function createPrismaActivityOverdueScanPort(): ActivityOverdueScanPort {
  return new PrismaActivityOverdueScanPort()
}
