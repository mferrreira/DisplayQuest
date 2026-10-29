import { prisma } from "@/lib/database/prisma"
import type {
  TechnicalReportGenerationPort,
  TechnicalReportMemberRow,
  TechnicalReportProjectContext,
} from "@/backend/modules/reporting/application/ports/technical-report-generation.port"

/**
 * PrismaTechnicalReportGeneration — leitura de `projects`, `users` e `project_members`
 * por adaptador próprio do módulo de reporting (RG-04, V5-9b).
 *
 * `listActiveMembers` filtra por `situacao = ATIVO` (DEC-167): o bloco de identificação
 * do oficial descreve quem está no projeto hoje. Ordem por userId — geração lote
 * determinística.
 */
export class PrismaTechnicalReportGeneration implements TechnicalReportGenerationPort {
  async findProjectContext(projectId: number): Promise<TechnicalReportProjectContext | null> {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        startDate: true,
        endDate: true,
        proppiNumber: true,
        leaderId: true,
        leader: { select: { name: true } },
      },
    })
    if (!project) return null
    return {
      projectId: project.id,
      name: project.name,
      createdAt: project.createdAt,
      startDate: project.startDate,
      endDate: project.endDate,
      proppiNumber: project.proppiNumber,
      leaderId: project.leaderId,
      leaderName: project.leader?.name ?? null,
    }
  }

  async listActiveMembers(projectId: number): Promise<TechnicalReportMemberRow[]> {
    const members = await prisma.project_members.findMany({
      where: { projectId, situacao: "ATIVO" },
      orderBy: { userId: "asc" },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
            course: true,
            scholarshipType: true,
            fundingAgency: true,
            fundingAgencyOther: true,
          },
        },
      },
    })
    return members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      course: member.user.course,
      scholarshipType: member.user.scholarshipType,
      fundingAgency: member.user.fundingAgency,
      fundingAgencyOther: member.user.fundingAgencyOther,
    }))
  }
}
