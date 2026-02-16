import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import type { NextRequest } from "next/server"
import { createApiError } from "../utils/utils"
import {
  hasPermission as canAccessPermission,
  hasRole as hasRbacRole,
  type Permission,
  type Role,
  ROLE_VALUES,
} from "./rbac"
import { FEATURE_ACCESS, hasFeatureAccess } from "./features"

export async function getUserFromRequest(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  return session?.user || null
}

export function hasRole(user: any, roles: Role | Role[]): boolean {
  if (!user || !user.roles) return false
  return hasRbacRole(user.roles, roles)
}

export async function requireAuth(): Promise<{ user: any; error?: Response }> {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return { user: null, error: createApiError("Não autorizado", 401) }
  }

  return { user: session.user }
}

export async function requireRole(roles: Role | Role[]): Promise<{ user: any; error?: Response }> {
  const authResult = await requireAuth()
  if (authResult.error) return authResult

  if (!hasRole(authResult.user, roles)) {
    return { user: null, error: createApiError("Acesso negado", 403) }
  }

  return { user: authResult.user }
}

export async function requirePermission(permission: Permission): Promise<{ user: any; error?: Response }> {
  const authResult = await requireAuth()
  if (authResult.error) return authResult

  if (!canAccessPermission(authResult.user?.roles, permission)) {
    return { user: null, error: createApiError("Acesso negado", 403) }
  }

  return { user: authResult.user }
}

export async function requireActiveUser(): Promise<{ user: any; error?: Response }> {
  const authResult = await requireAuth()
  if (authResult.error) return authResult

  if (authResult.user.status !== "active") {
    return { user: null, error: createApiError("Usuário não está ativo", 403) }
  }

  return { user: authResult.user }
}

export const ROLES = {
  COORDENADOR: "COORDENADOR",
  GERENTE: "GERENTE",
  LABORATORISTA: "LABORATORISTA",
  PESQUISADOR: "PESQUISADOR",
  GERENTE_PROJETO: "GERENTE_PROJETO",
  COLABORADOR: "COLABORADOR",
  VOLUNTARIO: "VOLUNTARIO",
} as const

export function canManageUsers(userRoles: unknown): boolean {
  return canAccessPermission(userRoles, "MANAGE_USERS")
}

export function canManageProjects(userRoles: unknown): boolean {
  return canAccessPermission(userRoles, "MANAGE_PROJECTS")
}

export function canManageTasks(userRoles: unknown): boolean {
  return canAccessPermission(userRoles, "MANAGE_TASKS")
}

export function canViewAllData(userRoles: unknown): boolean {
  return hasFeatureAccess(userRoles, "VIEW_ALL_DATA")
}

export const ACCESS_CONTROL = FEATURE_ACCESS

export function hasAccess(userRoles: unknown, feature: keyof typeof ACCESS_CONTROL): boolean {
  return hasFeatureAccess(userRoles, feature)
}

export { authOptions, ROLE_VALUES }
