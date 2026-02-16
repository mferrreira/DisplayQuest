import { hasRole, normalizeRoles, type Role } from "@/lib/auth/rbac"

export const FEATURE_ACCESS = {
  DASHBOARD_ADMIN: ["COORDENADOR", "GERENTE"],
  DASHBOARD_WEEKLY_REPORTS: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  DASHBOARD_PROJETOS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "PESQUISADOR", "COLABORADOR"],
  VIEW_PROJECT_DASHBOARD: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "PESQUISADOR", "COLABORADOR", "VOLUNTARIO"],
  MANAGE_REWARDS: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  MANAGE_USERS: ["COORDENADOR", "GERENTE"],
  MANAGE_PROJECTS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  MANAGE_TASKS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR", "PESQUISADOR"],
  MANAGE_PROJECT_MEMBERS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  MANAGE_SCHEDULE: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  MANAGE_BADGES: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  VIEW_ALL_DATA: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  VIEW_WEEKLY_REPORTS: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  EDIT_PROJECT: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  EDIT_TASKS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR"],
  CREATE_TASK: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR"],
  CREATE_PROJECT: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  MANAGE_LABORATORY: ["COORDENADOR", "LABORATORISTA"],
  ASSUME_LAB_RESPONSIBILITY: ["COORDENADOR", "LABORATORISTA"],
  COMPLETE_PUBLIC_TASKS: ["VOLUNTARIO", "COLABORADOR", "GERENTE_PROJETO", "COORDENADOR", "GERENTE"],
  ASSIGN_TASKS_TO_VOLUNTEERS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR"],
  APPROVE_USERS: ["COORDENADOR", "LABORATORISTA"],
  APPROVE_PURCHASES: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  VIEW_ALL_LOGS: ["COORDENADOR"],
  EDIT_OWN_LOGS: ["COORDENADOR", "LABORATORISTA", "GERENTE", "GERENTE_PROJETO", "COLABORADOR", "VOLUNTARIO"],
} as const satisfies Record<string, Role[]>

export type FeatureAccess = keyof typeof FEATURE_ACCESS

export function hasFeatureAccess(userRoles: unknown, feature: FeatureAccess): boolean {
  return hasRole(userRoles, FEATURE_ACCESS[feature])
}

export function hasAnyRole(userRoles: unknown, roles: Role[]): boolean {
  const normalized = normalizeRoles(userRoles)
  return normalized.some((role) => roles.includes(role))
}

export function hasAllRoles(userRoles: unknown, roles: Role[]): boolean {
  const normalized = normalizeRoles(userRoles)
  return roles.every((role) => normalized.includes(role))
}

export function getPrimaryRole(userRoles: unknown): Role | "USUARIO" {
  const normalized = normalizeRoles(userRoles)
  const rolePriority: Role[] = [
    "COORDENADOR",
    "GERENTE",
    "LABORATORISTA",
    "GERENTE_PROJETO",
    "PESQUISADOR",
    "COLABORADOR",
    "VOLUNTARIO",
  ]

  for (const role of rolePriority) {
    if (normalized.includes(role)) {
      return role
    }
  }

  return "USUARIO"
}

export function getRoleDisplayName(role: string): string {
  const roleNames: Record<string, string> = {
    COORDENADOR: "Coordenador",
    GERENTE: "Gerente",
    LABORATORISTA: "Laboratorista",
    GERENTE_PROJETO: "Gerente de Projeto",
    PESQUISADOR: "Pesquisador",
    COLABORADOR: "Colaborador",
    VOLUNTARIO: "Voluntario",
    USUARIO: "Usuario",
  }

  return roleNames[role] || role
}
