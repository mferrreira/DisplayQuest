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

/**
 * V6-9 (RF-V6.12 R2 / RF-V6.14 R3): o Painel Administrativo é servido a
 * `DASHBOARD_ADMIN ∪ DASHBOARD_VOLUNTEERS`, com gate por aba. A entrada é decidida
 * no servidor (`app/(dashboard)/dashboard/admin/layout.tsx`); esta é a decisão pura
 * que o servidor e o teste compartilham — quem não porta nenhuma das duas chaves não
 * vê o painel (o `DASHBOARD_VOLUNTEERS` puro entra só para ver a aba Voluntários).
 */
export function canAccessAdminPanel(userRoles: unknown): boolean {
  return hasAccess(userRoles, "DASHBOARD_ADMIN") || hasAccess(userRoles, "DASHBOARD_VOLUNTEERS")
}

export { hasAnyRole, hasAllRoles, getPrimaryRole, getRoleDisplayName }
