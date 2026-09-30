// @vitest-environment node
/**
 * ONDA 0 / batch 0.3 — DC2: the RBAC policy is pure and frozen.
 *
 * This is the matrix itself, written out. If a role gains or loses a permission the diff has
 * to appear here, in one place, with a task name attached — not as a side effect of someone
 * editing a gateway.
 */
import { describe, expect, it } from "vitest";
import {
  PERMISSION_KEYS,
  ROLE_VALUES,
  USER_ROLES,
  hasAllRoles,
  hasAnyRole,
  hasFeatureAccess,
  hasPermission,
  hasRole,
  isRole,
  normalizeRoles,
  rolesFor,
  type Permission,
  type Role,
} from "@/backend/domain/identity";

/**
 * FROZEN MATRIX — role -> permissions it grants.
 * Derived from the pre-refactor `lib/auth/rbac.ts` PERMISSIONS map and pinned here so a
 * behaviour change cannot arrive disguised as a refactor.
 */
const EXPECTED_MATRIX: Record<Role, Permission[]> = {
  COORDENADOR: [
    "MANAGE_USERS",
    "MANAGE_NOTIFICATIONS",
    "MANAGE_REWARDS",
    "MANAGE_PURCHASES",
    "MANAGE_WORK_SESSIONS",
    "MANAGE_PROJECTS",
    "MANAGE_PROJECT_MEMBERS",
    "MANAGE_TASKS",
  ],
  GERENTE: [
    "MANAGE_USERS",
    "MANAGE_NOTIFICATIONS",
    "MANAGE_REWARDS",
    "MANAGE_PURCHASES",
    "MANAGE_WORK_SESSIONS",
    "MANAGE_PROJECTS",
    "MANAGE_PROJECT_MEMBERS",
    "MANAGE_TASKS",
  ],
  LABORATORISTA: ["MANAGE_REWARDS", "MANAGE_PURCHASES", "MANAGE_WORK_SESSIONS"],
  GERENTE_PROJETO: ["MANAGE_PROJECTS", "MANAGE_PROJECT_MEMBERS", "MANAGE_TASKS"],
  PESQUISADOR: ["MANAGE_TASKS"],
  COLABORADOR: ["MANAGE_TASKS"],
  VOLUNTARIO: [],
};

const ALL_PERMISSIONS = PERMISSION_KEYS;

describe("RBAC policy matrix", () => {
  it("enumerates exactly the seven domain roles and the eight permissions", () => {
    expect(ROLE_VALUES).toEqual(USER_ROLES);
    expect(ROLE_VALUES).toHaveLength(7);
    expect(ALL_PERMISSIONS).toHaveLength(8);
  });

  it.each(ROLE_VALUES)("role %s grants exactly the frozen set", (role) => {
    const granted = ALL_PERMISSIONS.filter((permission) => hasPermission([role], permission));
    expect(granted).toEqual(EXPECTED_MATRIX[role]);
  });

  it("VOLUNTARIO gets nothing from the permission map (default denial, AGENTS.md roles)", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission(["VOLUNTARIO"], permission), `VOLUNTARIO/${permission}`).toBe(false);
    }
  });

  it("an unknown role grants nothing", () => {
    expect(hasPermission(["ADMIN"], "MANAGE_USERS" as Permission)).toBe(false);
    expect(hasPermission(["coordenador"], "MANAGE_USERS")).toBe(false);
    expect(isRole("coordenador")).toBe(false);
  });

  it("an empty or malformed role list grants nothing", () => {
    expect(hasPermission([], "MANAGE_USERS")).toBe(false);
    expect(hasPermission(undefined, "MANAGE_USERS")).toBe(false);
    expect(hasPermission(null, "MANAGE_USERS")).toBe(false);
    expect(hasPermission("COORDENADOR", "MANAGE_USERS")).toBe(false);
    expect(hasPermission([42, null, "COORDENADOR"], "MANAGE_USERS")).toBe(true);
  });

  it("multi-role users match when ANY role satisfies the requirement", () => {
    expect(hasPermission(["VOLUNTARIO", "LABORATORISTA"], "MANAGE_REWARDS")).toBe(true);
    expect(hasPermission(["VOLUNTARIO", "PESQUISADOR"], "MANAGE_WORK_SESSIONS")).toBe(false);
  });

  it("rolesFor exposes the matrix for error context without mutating it", () => {
    expect(rolesFor("MANAGE_WORK_SESSIONS")).toEqual(["COORDENADOR", "GERENTE", "LABORATORISTA"]);
  });

  it("hasRole accepts a single role or a list", () => {
    expect(hasRole(["GERENTE"], "GERENTE")).toBe(true);
    expect(hasRole(["GERENTE"], ["COORDENADOR", "GERENTE"])).toBe(true);
    expect(hasRole(["GERENTE"], ["COORDENADOR"])).toBe(false);
  });

  it("hasAnyRole / hasAllRoles keep their semantics", () => {
    expect(hasAnyRole(["GERENTE", "VOLUNTARIO"], ["GERENTE", "COORDENADOR"])).toBe(true);
    expect(hasAnyRole(["VOLUNTARIO"], ["GERENTE", "COORDENADOR"])).toBe(false);
    expect(hasAllRoles(["GERENTE", "COORDENADOR"], ["GERENTE", "COORDENADOR"])).toBe(true);
    expect(hasAllRoles(["GERENTE"], ["GERENTE", "COORDENADOR"])).toBe(false);
  });

  it("normalizeRoles filters invalid entries instead of throwing", () => {
    expect(normalizeRoles(["COORDENADOR", "NOT_A_ROLE", 42, null])).toEqual(["COORDENADOR"]);
    expect(normalizeRoles("COORDENADOR")).toEqual([]);
    expect(normalizeRoles(undefined)).toEqual([]);
  });

  it("feature access (the UI map) also defaults to denial", () => {
    expect(hasFeatureAccess(["VOLUNTARIO"], "MANAGE_USERS")).toBe(false);
    expect(hasFeatureAccess(["COORDENADOR"], "VIEW_ALL_LOGS")).toBe(true);
    expect(hasFeatureAccess(["GERENTE"], "VIEW_ALL_LOGS")).toBe(false);
    expect(hasFeatureAccess(["LABORATORISTA"], "APPROVE_USERS")).toBe(true);
    expect(hasFeatureAccess(["PESQUISADOR"], "APPROVE_USERS")).toBe(false);
  });
});
