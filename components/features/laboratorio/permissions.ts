import type { UserRole } from "@/contexts/types"

const ROLE_PRIORITY: Record<UserRole, number> = {
  GERENTE: 5,
  COORDENADOR: 4,
  LABORATORISTA: 3,
  GERENTE_PROJETO: 2,
  PESQUISADOR: 2,
  COLABORADOR: 1,
  VOLUNTARIO: 1,
}

export function getHighestRolePriority(roles: UserRole[] = []): number {
  return roles.reduce((highest, role) => Math.max(highest, ROLE_PRIORITY[role] ?? 0), 0)
}

interface LabUserLike {
  id: number
  roles?: UserRole[] | string[]
}

/**
 * Um usuário pode gerenciar eventos/avisos de outro apenas se tiver um dos
 * papéis de moderação e prioridade de papel maior que o alvo.
 */
export function canManageTargetEvent(
  user: { id: number; roles?: UserRole[] | string[] } | null | undefined,
  labUsers: LabUserLike[],
  targetUserId?: number,
): boolean {
  if (!user || !targetUserId) return false
  if (user.id === targetUserId) return true

  const canManageOthers = (user.roles || []).some((role) =>
    ["GERENTE", "COORDENADOR", "LABORATORISTA"].includes(role as string),
  )
  if (!canManageOthers) return false

  const targetUser = labUsers.find((labUser) => labUser.id === targetUserId)
  if (!targetUser) return false

  return (
    getHighestRolePriority((user.roles || []) as UserRole[]) >
    getHighestRolePriority((targetUser.roles || []) as UserRole[])
  )
}
