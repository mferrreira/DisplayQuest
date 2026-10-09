/**
 * lib/auth/rbac.ts — thin re-export of the pure RBAC now living in `backend/domain/identity`
 * (SPEC §4.3, AC-00-09). Before batch 0.3 this file took `UserRole` from the ORM client, which
 * is exactly the leak PLAN §2.5 lists.
 *
 * THE PUBLIC CONTRACT IS DELIBERATELY UNCHANGED: every caller keeps importing the same names
 * from the same path. Only the origin of the types moved (AGENT.md §5 — "so a origem do tipo").
 * `Role` is structurally the same union of the seven role strings the schema defines.
 */
export {
  PERMISSIONS,
  ROLE_VALUES,
  hasPermission,
  hasRole,
  isRole,
  normalizeRoles,
  type Permission,
  type Role,
} from "@/backend/domain/identity";
