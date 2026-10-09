/**
 * lib/auth/features.ts — feature-visibility helpers.
 *
 * The FEATURE_ACCESS matrix itself moved to `backend/domain/identity/permissions.ts`
 * (SPEC §4.3): authorisation data belongs to the domain, this file keeps only what is
 * specifically about presenting the app to a user (primary role, display names).
 *
 * Re-exported instead of copied: a frontend map drifting from the backend map is the exact
 * failure mode tests/unit/rbac-contract.test.ts was written to kill (risk R5).
 */
import { normalizeRoles, type Role } from "@/backend/domain/identity";

export {
  FEATURE_ACCESS,
  FEATURE_KEYS,
  hasAllRoles,
  hasAnyRole,
  hasFeatureAccess,
  type FeatureAccess,
} from "@/backend/domain/identity";

export function getPrimaryRole(userRoles: unknown): Role | "USUARIO" {
  const normalized = normalizeRoles(userRoles);
  const rolePriority: Role[] = [
    "COORDENADOR",
    "GERENTE",
    "LABORATORISTA",
    "GERENTE_PROJETO",
    "PESQUISADOR",
    "COLABORADOR",
    "VOLUNTARIO",
  ];

  for (const role of rolePriority) {
    if (normalized.includes(role)) {
      return role;
    }
  }

  return "USUARIO";
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
  };

  return roleNames[role] || role;
}
