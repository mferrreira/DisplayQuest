/**
 * PrismaProjectCompletionRequestsPort — adaptador do flag "conclusão solicitada" por projeto
 * (fix 4, 2026-10-28). Lê `project_activities` em COMPLETION_REQUESTED e devolve os ids de
 * projeto com solicitação em aberto, deduplicados. Nenhuma regra: a tela decide o que pintar.
 */
import { prisma } from "@/lib/database/prisma"
import type { ProjectCompletionRequestsPort } from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

export class PrismaProjectCompletionRequestsPort implements ProjectCompletionRequestsPort {
  async listProjectIdsWithRequests(): Promise<number[]> {
    const rows = await prisma.project_activities.findMany({
      where: { status: "COMPLETION_REQUESTED" },
      select: { projectId: true },
    })
    return [...new Set(rows.map((row) => row.projectId))].sort((a, b) => a - b)
  }
}

export function createPrismaProjectCompletionRequestsPort(): ProjectCompletionRequestsPort {
  return new PrismaProjectCompletionRequestsPort()
}
