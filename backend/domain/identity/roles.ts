/**
 * Role primitives — pure domain (SPEC §4.3, AC-00-09).
 *
 * Moved out of `lib/auth/rbac.ts`, which imported `UserRole` from `@prisma/client`
 * (PLAN §2.5). `lib/auth/rbac.ts` now re-exports this module and keeps its public contract
 * identical, so no caller changes (AC-00-14).
 *
 * Behaviour is a verbatim copy: same role list, same "any role matches", same defensive
 * normalisation of non-array input. That is proven by
 * tests/unit/modules/_foundations/rbac-ui-parity.test.ts.
 */
import { USER_ROLES, UserRole, isUserRole } from "./UserRole";

/** Domain alias: the backend speaks `Role`, the schema calls it `UserRole`. Same values. */
export type Role = UserRole;

/** Declaration order is part of the contract (leaderboards/labels iterate over it). */
export const ROLE_VALUES: Role[] = [...USER_ROLES];

export function isRole(value: string): value is Role {
  return ROLE_VALUES.includes(value as Role);
}

/** Never throws on dirty input: sessions/DB payloads are `unknown` at this boundary. */
export function normalizeRoles(values: unknown): Role[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is Role => typeof value === "string" && isRole(value));
}

export function hasRole(userRoles: unknown, required: Role | Role[]): boolean {
  const roles = normalizeRoles(userRoles);
  const requiredRoles = Array.isArray(required) ? required : [required];
  return requiredRoles.some((role) => roles.includes(role));
}

export function hasAnyRole(userRoles: unknown, roles: Role[]): boolean {
  const normalized = normalizeRoles(userRoles);
  return normalized.some((role) => roles.includes(role));
}

export function hasAllRoles(userRoles: unknown, roles: Role[]): boolean {
  const normalized = normalizeRoles(userRoles);
  return roles.every((role) => normalized.includes(role));
}
