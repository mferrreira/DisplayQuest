import { ForbiddenError, canActorAccessProjectDecision, isProjectVolunteerRole, summarizeVolunteerStats, toVolunteerEntry, weekWindow } from "@/backend/domain"
import type { GetProjectVolunteersQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectHoursPort } from "@/backend/modules/project-management/application/ports/project-hours.port"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"

/**
 * GetProjectVolunteersUseCase — OND5-B2 (R2). A agregação continua congelada do gateway
 * (:171-246): só membros VOLUNTARIO/COLABORADOR (joinedAt ASC), SUMs de sessão concluída por
 * pessoa na semana local segunda-based, visões arredondadas, totais sobre as horas JÁ
 * arredondadas.
 *
 * O gate mudou no V5-2a (DEC-127, decisão do dono no batch): era MANAGE_PROJECTS OU
 * canActorManageProject — quem não participava do projeto levava 403 no card de horas do
 * detalhe. Hoje é a decisão de leitura do projeto: qualquer autenticado lê. O `actors` saiu das
 * dependências porque a leitura não consulta membership nem líder/criador.
 */
export interface GetProjectVolunteersDependencies {
  memberships: ProjectManagementMembershipPort
  hours: ProjectHoursPort
}

export class GetProjectVolunteersUseCase {
  constructor(private readonly dependencies: GetProjectVolunteersDependencies) {}

  async execute(query: GetProjectVolunteersQuery) {
    if (!canActorAccessProjectDecision(query.actorId)) {
      throw new ForbiddenError("Acesso negado ao projeto")
    }

    const members = await this.dependencies.memberships.listMembersWithUser(query.projectId)
    const volunteersOnly = members.filter((member) => isProjectVolunteerRole(member.roles))

    const now = new Date()
    const window = weekWindow(now)

    const volunteers = []
    for (const member of volunteersOnly) {
      const totalSeconds = await this.dependencies.hours.sumCompletedSeconds(member.userId, query.projectId)
      const weekSeconds = await this.dependencies.hours.sumCompletedSeconds(member.userId, query.projectId, window)
      volunteers.push(toVolunteerEntry(member, totalSeconds, weekSeconds, now))
    }

    return {
      volunteers,
      stats: summarizeVolunteerStats(volunteers),
    }
  }
}
