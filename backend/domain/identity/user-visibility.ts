/**
 * User-list visibility policy — pure domain rule of the identity aggregate (OND2-B2, R2).
 *
 * Moved verbatim out of `UserServiceGateway.listUsersForActor`: which FIELDS each actor role
 * may see when listing users. The gateway then executed the I/O; the decision lives here.
 * The role lists are the current ones (frozen by the golden matrix, OND2-B1).
 */
export interface UserListVisibility {
  canViewFullUsers: boolean;
  canManageProjectMembers: boolean;
  canViewBasicUsers: boolean;
}

export function resolveUserListVisibility(actorRoles: readonly string[]): UserListVisibility {
  const roles = new Set(actorRoles);
  return {
    canViewFullUsers: roles.has("COORDENADOR") || roles.has("GERENTE"),
    canManageProjectMembers: roles.has("GERENTE_PROJETO"),
    canViewBasicUsers:
      roles.has("COORDENADOR") ||
      roles.has("GERENTE") ||
      roles.has("GERENTE_PROJETO") ||
      roles.has("PESQUISADOR") ||
      roles.has("VOLUNTARIO") ||
      roles.has("COLABORADOR") ||
      roles.has("LABORATORISTA"),
  };
}
