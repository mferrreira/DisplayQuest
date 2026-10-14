import { canActorRequestActivityCompletionDecision } from "@/backend/domain"
import type { ProjectRecord } from "@/backend/modules/project-management/application/ports/project.repository"
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * resolveCanRequestActivityCompletion — V5-7a (DEC-76/162). O gate da fase de PEDIR: líder do
 * projeto OU membership com papel de gestor do projeto. Não é o `resolveCanActorManageProject`
 * da gestão: o quirk da ACL (membership vence; sem membership, MANAGE_USERS global) governa a
 * grade, e o global sem membership que gerencia a grade não pede conclusão — ele é o lado que
 * aprova (DEC-77). Os dois gates coexistem de propósito; a DEC-76 nomeia cada lado.
 *
 * Devolve o projeto junto com a decisão: o use case precisa do 404 de projeto ausente ANTES do
 * 403 (mesma ordem medida do anexo), e buscar o projeto duas vezes por escrita seria só ruído.
 */
export async function resolveCanRequestActivityCompletion(
  dependencies: { projects: ProjectRepositoryPort; memberships: ProjectManagementMembershipPort },
  projectId: number,
  actorId: number,
): Promise<{ project: ProjectRecord | null; canRequest: boolean }> {
  const [project, membership] = await Promise.all([
    dependencies.projects.findById(projectId),
    dependencies.memberships.findMembership(projectId, actorId),
  ])
  const canRequest = canActorRequestActivityCompletionDecision(
    actorId,
    project ? project.leaderId ?? null : null,
    membership ? membership.roles : null,
  )
  return { project, canRequest }
}
