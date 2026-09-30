/**
 * RBAC contract test (E1/T1.7) — kills the dual-permission-map drift class (risk R5).
 *
 * Invariants:
 * 1. FEATURE_ACCESS may only reference valid Role values (runtime guard; tsc enforces statically
 *    via `satisfies`, this protects JS consumers and future refactors that drop it).
 * 2. For keys that exist in BOTH maps, role arrays must be IDENTICAL. The backend is authority;
 *    the frontend map may add UI-visibility concepts but never contradict backend permissions.
 * 3. Regression tripwires for known historical bugs:
 *    - D-8/E6: reward-context.tsx checked only LABORATORISTA||COORDENADOR for store management,
 *      omitting GERENTE which both maps grant via MANAGE_REWARDS.
 */
import { describe, expect, it } from "vitest";
import { FEATURE_ACCESS } from "@/lib/auth/features";
import { PERMISSIONS, ROLE_VALUES, hasPermission, normalizeRoles } from "@/lib/auth/rbac";

describe("RBAC maps", () => {
  it("FEATURE_ACCESS uses only valid Role values", () => {
    for (const [, roles] of Object.entries(FEATURE_ACCESS)) {
      for (const role of roles) {
        expect(ROLE_VALUES, `feature role ${role} is not a valid UserRole`).toContain(role);
      }
    }
  });

  it("shared keys between FEATURE_ACCESS and backend PERMISSIONS are identical", () => {
    const shared = Object.keys(PERMISSIONS).filter(
      (key) => key in FEATURE_ACCESS,
    ) as Array<keyof typeof PERMISSIONS>;

    expect(shared.length, "expected at least one shared key; if maps diverged intentionally, update this test").toBeGreaterThan(0);

    for (const key of shared) {
      const backendRoles = [...PERMISSIONS[key]].sort();
      const frontendRoles = [...FEATURE_ACCESS[key as keyof typeof FEATURE_ACCESS]].sort();
      expect(frontendRoles, `FEATURE_ACCESS.${key} diverges from backend PERMISSIONS.${key}`).toEqual(
        backendRoles,
      );
    }
  });

  it("MANAGE_REWARDS includes GERENTE (E6 reward-role-drift tripwire)", () => {
    expect(FEATURE_ACCESS.MANAGE_REWARDS).toContain("GERENTE");
    expect(hasPermission(["GERENTE"], "MANAGE_REWARDS")).toBe(true);
  });
});

describe("role helpers", () => {
  it("normalizeRoles filters invalid entries", () => {
    expect(normalizeRoles(["COORDENADOR", "NOT_A_ROLE", 42, null])).toEqual(["COORDENADOR"]);
    expect(normalizeRoles("COORDENADOR")).toEqual([]);
    expect(normalizeRoles(undefined)).toEqual([]);
  });

  it("multi-role users match when ANY role satisfies the requirement", () => {
    expect(hasPermission(["VOLUNTARIO", "LABORATORISTA"], "MANAGE_REWARDS")).toBe(true);
    expect(hasPermission(["VOLUNTARIO"], "MANAGE_REWARDS")).toBe(false);
  });
});
