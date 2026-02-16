import type { SelfOrPermissionCommand } from "@/backend/modules/identity-access/application/contracts"
import type { IdentityAccessGateway } from "@/backend/modules/identity-access/application/ports/identity-access.gateway"
import { createIdentityAccessGateway } from "@/backend/modules/identity-access/infrastructure/rbac-identity-access.gateway"
import type { Permission, Role } from "@/lib/auth/rbac"

export class IdentityAccessModule {
  constructor(private readonly gateway: IdentityAccessGateway) {}

  hasPermission(userRoles: unknown, permission: Permission) {
    return this.gateway.hasPermission(userRoles, permission)
  }

  hasAnyRole(userRoles: unknown, roles: Role[]) {
    return this.gateway.hasAnyRole(userRoles, roles)
  }

  canAccessSelfOrPermission(command: SelfOrPermissionCommand) {
    return this.gateway.canAccessSelfOrPermission(command)
  }
}

export function createIdentityAccessModule() {
  return new IdentityAccessModule(createIdentityAccessGateway())
}
