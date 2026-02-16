import {
  FEATURE_ACCESS,
  getPrimaryRole,
  getRoleDisplayName,
  hasAllRoles,
  hasAnyRole,
  hasFeatureAccess,
} from "@/lib/auth/features"

export const ACCESS_CONTROL = FEATURE_ACCESS

export function hasAccess(userRoles: unknown, feature: keyof typeof ACCESS_CONTROL): boolean {
  return hasFeatureAccess(userRoles, feature)
}

export { hasAnyRole, hasAllRoles, getPrimaryRole, getRoleDisplayName }
