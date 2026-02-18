import type { Permission, Role } from "@/lib/auth/rbac"

export interface IdentityActor {
  id: number
  roles: Role[]
}

export interface SelfOrPermissionCommand {
  actor: IdentityActor
  ownerUserId: number
  permission: Permission
}
