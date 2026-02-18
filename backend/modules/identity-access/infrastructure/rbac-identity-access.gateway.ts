import type { SelfOrPermissionCommand } from "@/backend/modules/identity-access/application/contracts"
import type { IdentityAccessGateway } from "@/backend/modules/identity-access/application/ports/identity-access.gateway"
import { hasPermission, normalizeRoles, type Permission, type Role } from "@/lib/auth/rbac"

export class RbacIdentityAccessGateway implements IdentityAccessGateway {
  hasPermission(userRoles: unknown, permission: Permission): boolean {
    return hasPermission(userRoles, permission)
  }

  hasAnyRole(userRoles: unknown, roles: Role[]): boolean {
    const normalized = normalizeRoles(userRoles)
    return normalized.some((role) => roles.includes(role))
  }

  canAccessSelfOrPermission(command: SelfOrPermissionCommand): boolean {
    if (command.actor.id === command.ownerUserId) {
      return true
    }

    return this.hasPermission(command.actor.roles, command.permission)
  }
}

export function createIdentityAccessGateway() {
  return new RbacIdentityAccessGateway()
}
