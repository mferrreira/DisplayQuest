import type { UserRole } from "@prisma/client";

export type Role = UserRole;

export const ROLE_VALUES: Role[] = [
  "COORDENADOR",
  "GERENTE",
  "LABORATORISTA",
  "PESQUISADOR",
  "GERENTE_PROJETO",
  "COLABORADOR",
  "VOLUNTARIO",
];

export const PERMISSIONS = {
  MANAGE_USERS: ["COORDENADOR", "GERENTE"],
  MANAGE_NOTIFICATIONS: ["COORDENADOR", "GERENTE"],
  MANAGE_REWARDS: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  MANAGE_PURCHASES: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  MANAGE_WORK_SESSIONS: ["COORDENADOR", "GERENTE", "LABORATORISTA"],
  MANAGE_PROJECTS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  MANAGE_PROJECT_MEMBERS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"],
  MANAGE_TASKS: ["COORDENADOR", "GERENTE", "GERENTE_PROJETO", "COLABORADOR", "PESQUISADOR"],
} as const satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isRole(value: string): value is Role {
  return ROLE_VALUES.includes(value as Role);
}

export function normalizeRoles(values: unknown): Role[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is Role => typeof value === "string" && isRole(value));
}

export function hasRole(userRoles: unknown, required: Role | Role[]): boolean {
  const roles = normalizeRoles(userRoles);
  const requiredRoles = Array.isArray(required) ? required : [required];
  return requiredRoles.some((role) => roles.includes(role));
}

export function hasPermission(userRoles: unknown, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return hasRole(userRoles, allowedRoles as Role[]);
}
