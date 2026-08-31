import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
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

  const sessionUser = session.user as any

  // A3: contas suspensas/rejeitadas/pendentes não mantêm acesso via sessão existente.
  // O session callback (lib/auth/config.ts) já refresca `status` do banco a cada request,
  // então esta checagem reflete o estado atual — não apenas o do login.
  if (sessionUser.status && sessionUser.status !== "active") {
    return { user: null, error: createApiError("Usuário não está ativo", 403) }
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
  // requireAuth já valida status ("active") — mantido como alias para não quebrar usos existentes.
  return requireAuth()
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
