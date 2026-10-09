import type { Permission, Role } from "@/backend/domain"

export interface IdentityActor {
  id: number
  roles: Role[]
}

export interface SelfOrPermissionCommand {
  actor: IdentityActor
  ownerUserId: number
  permission: Permission
}
