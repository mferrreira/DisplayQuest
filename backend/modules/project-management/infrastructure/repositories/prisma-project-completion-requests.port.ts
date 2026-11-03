/**
 * PrismaProjectCompletionRequestsPort — adaptador das projeções de conclusão (fix 4, 2026-10-28;
 * fila global S01, plan-v12, DEC-238). Lê `project_activities` em COMPLETION_REQUESTED:
 * ids de projeto com solicitação (flag do cartão) e as linhas da fila com o nome do projeto e de
 * quem pediu. Nenhuma regra: o gate e o prêmio previsto são do use case.
 */
import { prisma } from "@/lib/database/prisma"
import type {
  CompletionRequestRecord,
  ProjectCompletionRequestsPort,
} from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

export class PrismaProjectCompletionRequestsPort implements ProjectCompletionRequestsPort {
  async listProjectIdsWithRequests(): Promise<number[]> {
    const rows = await prisma.project_activities.findMany({
      where: { status: "COMPLETION_REQUESTED" },
      select: { projectId: true },
    })
    return [...new Set(rows.map((row) => row.projectId))].sort((a, b) => a - b)
  }

  async listCompletionRequests(): Promise<CompletionRequestRecord[]> {
    const rows = await prisma.project_activities.findMany({
      where: { status: "COMPLETION_REQUESTED" },
      include: {
        project: { select: { name: true } },
        requestedByUser: { select: { name: true } },
      },
      orderBy: [{ projectId: "asc" }, { order: "asc" }],
    })
    return rows.map((row) => ({
      projectId: row.projectId,
      projectName: row.project.name,
      activityId: row.id,
      order: row.order,
      description: row.description,
      firstMonth: row.firstMonth,
      lastMonth: row.lastMonth,
      requestedBy: row.requestedBy,
      requestedByName: row.requestedByUser?.name ?? null,
      requestedAt: row.requestedAt?.toISOString() ?? null,
    }))
  }
}

export function createPrismaProjectCompletionRequestsPort(): ProjectCompletionRequestsPort {
  return new PrismaProjectCompletionRequestsPort()
}
