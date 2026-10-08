import { ValidationError, mergeRoles, normalizeVolunteerIds, projectValidationMessage, requireActorPermission, validateProjectInput } from "@/backend/domain"
import type { Role } from "@/backend/domain"
import type { CreateProjectCommand } from "@/backend/modules/project-management/application/contracts"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * CreateProjectUseCase — OND5-B2 (R2). Frozen from the legacy gateway (:65-104):
 *   - the record is Project.create semantics (createdAt = server clock ISO, createdBy =
 *     actor) and the ProjectRepository validation runs BEFORE the write, keeping the
 *     "Dados inválidos: ..." message verbatim;
 *   - creator gets a GERENTE_PROJETO membership; leaderId !== actor gets one too;
 *   - volunteerIds: normalizeVolunteerIds (number > 0, dedup, skip actor/leader) and each
 *     per-volunteer failure is SWALLOWED with console.error (QUIRK, golden OND5-B1).
 */
export interface CreateProjectDependencies {
  projects: ProjectRepositoryPort
  memberships: ProjectManagementMembershipPort
}

export class CreateProjectUseCase {
  constructor(private readonly dependencies: CreateProjectDependencies) {}

  async execute(command: CreateProjectCommand) {
    // B6-3 (D4): o gate de MANAGE_PROJECTS desceu da rota (`ensurePermission` com mensagem
    // propria) para aqui, ANTES de qualquer validacao ou escrita — a ordem medida. A rota
    // chama `assertCanCreateProject` antes de ler o corpo (padrao B6-2b/2d) e este use case
    // recheca. A mensagem "Sem permissão para criar projeto" e a da rota legado, preservada.
    requireActorPermission(command.actor, "MANAGE_PROJECTS", "Sem permissão para criar projeto")

    const record = {
      name: command.data.name,
      description: command.data.description ?? null,
      createdAt: new Date().toISOString(),
      createdBy: command.actorId,
      leaderId: command.data.leaderId ?? null,
      status: command.data.status as string,
      links: command.data.links ?? null,
    }

    const errors = validateProjectInput(record)
    if (errors.length > 0) {
      throw new ValidationError(projectValidationMessage(errors))
    }

    const createdProject = await this.dependencies.projects.create(record)

    await this.ensureMembership(createdProject.id!, command.actorId, ["GERENTE_PROJETO"])

    if (command.data.leaderId && command.data.leaderId !== command.actorId) {
      await this.ensureMembership(createdProject.id!, command.data.leaderId, ["GERENTE_PROJETO"])
    }

    for (const volunteerId of normalizeVolunteerIds(command.volunteerIds, command.actorId, command.data.leaderId)) {
      try {
        await this.ensureMembership(createdProject.id!, volunteerId, ["VOLUNTARIO"])
      } catch (error) {
        console.error(`Erro ao adicionar voluntário ${volunteerId} ao projeto ${createdProject.id}:`, error)
      }
    }

    return createdProject
  }

  /** ensureProjectMembership (gateway :248-265): merge roles (dedup) when present, create otherwise. */
  private async ensureMembership(projectId: number, userId: number, roles: Role[]) {
    const existing = await this.dependencies.memberships.findMembership(projectId, userId)
    if (existing !== null) {
      await this.dependencies.memberships.updateMembershipRoles(existing.id, mergeRoles(existing.roles, roles))
      return
    }

    await this.dependencies.memberships.createMembership({ projectId, userId, roles: Array.from(new Set(roles)) })
  }
}
