/**
 * ProjectMembershipRepositoryPort — OND5-B2 (R1). The `project_members` seam of the
 * membership module. `listMembersWithUser` keeps the gateway's joinedAt DESC ordering;
 * user name/email are joined by the adapter (the views expose them as `string | null`).
 *
 * V5-4b (DEC-69/140/149): os dados do vínculo (`lattes`, `cargaHoraria`, `categoria`,
 * `situacao`, `dataEntrada`) entram no record, porque é a lista de membros que os mostra e é o
 * mesmo record que o use case de perfil devolve depois de escrever.
 */
import type { MemberCategory, MemberSituation } from "@/backend/domain"
import type { Role } from "@/backend/domain"

export interface MembershipSummary {
  id: number
  roles: Role[]
}

/** Os cinco campos do vínculo, na forma que o record carrega (DEC-149). */
export interface MembershipProfileFields {
  lattes: string | null
  cargaHoraria: number | null
  categoria: MemberCategory | null
  situacao: MemberSituation
  dataEntrada: string | null
}

export interface MembershipRecord extends MembershipProfileFields {
  id: number
  projectId: number
  userId: number
  roles: Role[]
  joinedAt: Date
  userName: string | null
  userEmail: string | null
}

export interface MembershipDetailRecord extends MembershipProfileFields {
  id: number
  userId: number
  roles: Role[]
  userName: string | null
}

export interface ProjectMembershipRepositoryPort {
  /** joinedAt DESC (frozen from the gateway's listProjectMembers). */
  listMembersWithUser(projectId: number): Promise<MembershipRecord[]>
  findMembership(projectId: number, userId: number): Promise<MembershipSummary | null>
  findMembershipById(membershipId: number, projectId: number): Promise<MembershipDetailRecord | null>
  countMembersWithRole(projectId: number, role: Role): Promise<number>
  createMembership(input: { projectId: number; userId: number; roles: Role[] }): Promise<MembershipRecord>
  updateMembershipRoles(membershipId: number, roles: Role[]): Promise<MembershipRecord>
  /**
   * V5-4b: escreve os campos do vínculo já normalizados pelo use case. O adapter não valida
   * nada — a regra é do domínio (RG-02), e o `Partial` existe porque chave ausente não apaga.
   */
  updateMembershipProfile(
    membershipId: number,
    data: Partial<MembershipProfileFields>,
  ): Promise<MembershipRecord>
  deleteMembership(membershipId: number): Promise<void>
}
