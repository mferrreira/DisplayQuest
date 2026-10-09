/**
 * hasPermission / hasFeatureAccess — the pure authorisation rule (SPEC §4.3, RG-11).
 *
 * Default is denial: an unknown role or an unknown permission never grants anything.
 * `hasFeatureAccess` keeps the same "any listed role is enough" semantics the routes use today.
 */
import { FEATURE_ACCESS, PERMISSIONS, type FeatureAccess, type Permission } from "./permissions";
import { hasRole, type Role } from "./roles";

/** Introspection helper (used by policy tests and later by error messages with context). */
export function rolesFor(permission: Permission): readonly Role[] {
  return PERMISSIONS[permission];
}

export function rolesForFeature(feature: FeatureAccess): readonly Role[] {
  return FEATURE_ACCESS[feature];
}

export function hasPermission(userRoles: unknown, permission: Permission): boolean {
  return hasRole(userRoles, PERMISSIONS[permission]);
}

export function hasFeatureAccess(userRoles: unknown, feature: FeatureAccess): boolean {
  return hasRole(userRoles, FEATURE_ACCESS[feature]);
}
