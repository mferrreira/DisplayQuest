import type { SelfOrPermissionCommand } from "@/backend/modules/identity-access/application/contracts"
import type { Permission, Role } from "@/backend/domain"

export interface IdentityAccessGateway {
  hasPermission(userRoles: unknown, permission: Permission): boolean
  hasAnyRole(userRoles: unknown, roles: Role[]): boolean
  canAccessSelfOrPermission(command: SelfOrPermissionCommand): boolean
}
