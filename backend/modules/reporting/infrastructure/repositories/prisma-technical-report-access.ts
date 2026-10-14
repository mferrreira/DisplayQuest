import { prisma } from "@/lib/database/prisma"
import type {
  TechnicalReportAccessPort,
  TechnicalReportProjectAccess,
} from "@/backend/modules/reporting/application/ports/technical-report-access.port"

/**
 * PrismaTechnicalReportAccess — o módulo de reporting lê `projects` e `project_members`
 * por adaptador próprio (RG-04 — mesmo desenho do `ReportingDirectory`, que já lê
 * `isProjectLeader`). Nenhuma regra aqui: o quirk da ACL é decidido pela função pura do
 * domínio no use case.
 */
export class PrismaTechnicalReportAccess implements TechnicalReportAccessPort {
  async findProjectAccess(
    projectId: number,
    actorId: number | null,
  ): Promise<TechnicalReportProjectAccess | null> {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: { id: true, leaderId: true },
    })
    if (!project) return null

    if (actorId === null) {
      return { projectId: project.id, leaderId: project.leaderId, membershipRoles: null }
    }

    const membership = await prisma.project_members.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
      select: { roles: true },
    })
    return {
      projectId: project.id,
      leaderId: project.leaderId,
      membershipRoles: membership ? membership.roles : null,
    }
  }
}
