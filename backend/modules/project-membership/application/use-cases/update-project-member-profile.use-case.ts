import {
  ForbiddenError,
  NotFoundError,
  applyMemberProfileFields,
  canManageProjectMembers,
  emptyMemberProfile,
} from "@/backend/domain"
import type {
  CreatedProjectMemberView,
  UpdateProjectMemberProfileCommand,
} from "@/backend/modules/project-membership/application/contracts"
import type { MembershipProfileFields } from "@/backend/modules/project-membership/application/ports/project-membership.repository"
import type { ProjectMembershipRepositoryPort } from "@/backend/modules/project-membership/application/ports/project-membership.repository"

/**
 * UpdateProjectMemberProfileUseCase — V5-4b (DEC-69/140/149).
 *
 * Ordem igual à dos irmãos do módulo (add/remove/set_roles): gate de gestão do projeto ->
 * vínculo existe, procurado escopado no projeto -> normalização pela regra pura -> escrita ->
 * view. O gate vem antes de qualquer escrita porque estes campos alimentam documento oficial
 * entregue (DEC-130), e a autorização não pode depender do corpo ser válido.
 *
 * O merge é feito SOBRE O QUE JÁ ESTÁ GRAVADO: o draft parte do record lido e recebe só as chaves
 * que vieram no corpo (`applyMemberProfileFields`), então chave ausente não apaga dado — a mesma
 * trava dos campos de pessoa (DEC-138). Escrever o merge inteiro em vez do patch é deliberado:
 * os campos não tocados reescrevem o próprio valor, e o adapter não precisa de segunda lógica de
 * patch.
 *
 * Quem gerencia o projeto, não a conta: `canManageProjectMembers` é a ACL do vínculo (papel global
 * de projeto OU `GERENTE_PROJETO` na membership), não `MANAGE_USERS`. A pessoa também edita os
 * próprios dados de pessoa — isso é o perfil (DEC-138); aqui se edita o VÍNCULO.
 */
export interface UpdateProjectMemberProfileDependencies {
  memberships: ProjectMembershipRepositoryPort
}

export class UpdateProjectMemberProfileUseCase {
  constructor(private readonly dependencies: UpdateProjectMemberProfileDependencies) {}

  async execute(
    command: UpdateProjectMemberProfileCommand,
  ): Promise<CreatedProjectMemberView> {
    const actorMembership = await this.dependencies.memberships.findMembership(command.projectId, command.actorUserId)
    if (!canManageProjectMembers(command.actorRoles, actorMembership?.roles ?? null)) {
      throw new ForbiddenError("Apenas coordenadores, gerentes ou gerente do projeto podem atualizar dados do membro")
    }

    const membership = await this.dependencies.memberships.findMembershipById(command.membershipId, command.projectId)
    if (!membership) {
      throw new NotFoundError("Membro não encontrado no projeto")
    }

    // Cópia explícita: a função muta o alvo, e o record lido não pode voltar mutado ao adapter se
    // a normalização recusar no meio do corpo.
    const draft = applyMemberProfileFields(
      { ...emptyMemberProfile(), ...membership },
      command.data ?? {},
    )

    const patch: MembershipProfileFields = {
      lattes: draft.lattes,
      cargaHoraria: draft.cargaHoraria,
      categoria: draft.categoria,
      situacao: draft.situacao,
      dataEntrada: draft.dataEntrada,
    }

    const updated = await this.dependencies.memberships.updateMembershipProfile(command.membershipId, patch)

    return {
      id: updated.id,
      userId: updated.userId,
      userName: updated.userName,
      userEmail: updated.userEmail,
      roles: updated.roles,
      joinedAt: updated.joinedAt.toISOString(),
      // O que volta é o que o adapter devolve, não o que o use case montou: se a persistência
      // discordar, a divergência aparece na resposta em vez de ficar escondida.
      lattes: updated.lattes,
      cargaHoraria: updated.cargaHoraria,
      categoria: updated.categoria,
      situacao: updated.situacao,
      dataEntrada: updated.dataEntrada,
    }
  }
}
