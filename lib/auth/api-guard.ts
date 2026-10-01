import { createApiError } from "@/lib/utils/utils"
import { normalizeRoles, type Permission, type Role } from "@/lib/auth/rbac"
import { requireAuth } from "@/lib/auth/server-auth"
import { getBackendComposition } from "@/backend/composition/root"

export interface ApiActor {
  id: number
  email?: string | null
  name?: string | null
  roles: Role[]
  status?: string | null
}

type AuthResult = { actor: ApiActor; error?: never } | { actor?: never; error: Response }

// repo-cleanup B4 (D3): a instancia de identity-access passou a vir do composition root
// (singleton compartilhado). Antes, api-guard criava createIdentityAccessModule() proprio
// em top-level — segunda instancia RBAC em producao fora do unico ponto de wiring.
const identityAccess = () => getBackendComposition().identityAccess

export async function requireApiActor(): Promise<AuthResult> {
  const authResult = await requireAuth()
  if (authResult.error) {
    return { error: authResult.error }
  }

  const user = authResult.user as any
  const actorId = Number(user?.id)
  if (!Number.isInteger(actorId) || actorId <= 0) {
    return { error: createApiError("Não autorizado", 401) }
  }

  return {
    actor: {
      id: actorId,
      email: typeof user?.email === "string" ? user.email : null,
      name: typeof user?.name === "string" ? user.name : null,
      roles: normalizeRoles(user?.roles),
      status: typeof user?.status === "string" ? user.status : null,
    },
  }
}

export function ensurePermission(actor: ApiActor, permission: Permission, message = "Acesso negado"): Response | null {
  if (!identityAccess().hasPermission(actor.roles, permission)) {
    return createApiError(message, 403)
  }
  return null
}

export function ensureAnyRole(actor: ApiActor, roles: Role[], message = "Acesso negado"): Response | null {
  if (!identityAccess().hasAnyRole(actor.roles, roles)) {
    return createApiError(message, 403)
  }
  return null
}

export function ensureSelfOrPermission(
  actor: ApiActor,
  ownerUserId: number,
  permission: Permission,
  message = "Acesso negado",
): Response | null {
  if (!identityAccess().canAccessSelfOrPermission({ actor, ownerUserId, permission })) {
    return createApiError(message, 403)
  }
  return null
}
