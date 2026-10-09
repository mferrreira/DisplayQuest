// @vitest-environment node
/**
 * ONDA 0 / batch 0.3 — DC2 (parity half): moving RBAC into the domain changed NO behaviour.
 *
 * The UI and the routes still import `@/lib/auth/rbac` and `@/lib/auth/features`. This test is
 * the placeholder that freezes the CURRENT output of those two modules against the domain
 * implementation, key by key, role by role. If a re-export ever points at a different map,
 * this goes red before a single route does.
 */
import { describe, expect, it } from "vitest";
import * as domain from "@/backend/domain/identity";
import * as libRbac from "@/lib/auth/rbac";
import * as libFeatures from "@/lib/auth/features";

const ROLE_PAIRS: Array<[string, domain.Role]> = [
  ["COORDENADOR", domain.UserRole.COORDENADOR],
  ["GERENTE", domain.UserRole.GERENTE],
  ["LABORATORISTA", domain.UserRole.LABORATORISTA],
  ["PESQUISADOR", domain.UserRole.PESQUISADOR],
  ["GERENTE_PROJETO", domain.UserRole.GERENTE_PROJETO],
  ["COLABORADOR", domain.UserRole.COLABORADOR],
  ["VOLUNTARIO", domain.UserRole.VOLUNTARIO],
];

describe("lib/auth/rbac keeps the exact pre-refactor contract", () => {
  it("ROLE_VALUES is unchanged (order included)", () => {
    expect(libRbac.ROLE_VALUES).toEqual([
      "COORDENADOR",
      "GERENTE",
      "LABORATORISTA",
      "PESQUISADOR",
      "GERENTE_PROJETO",
      "COLABORADOR",
      "VOLUNTARIO",
    ]);
  });

  it("PERMISSIONS is the same object the routes already read", () => {
    expect(libRbac.PERMISSIONS).toBe(domain.PERMISSIONS);
  });

  it("hasPermission is the domain function (no second implementation left behind)", () => {
    expect(libRbac.hasPermission).toBe(domain.hasPermission);
    expect(libRbac.hasRole).toBe(domain.hasRole);
    expect(libRbac.normalizeRoles).toBe(domain.normalizeRoles);
  });

  it.each(ROLE_PAIRS)("hasPermission agrees with the domain for %s", (_label, role) => {
    for (const permission of Object.keys(domain.PERMISSIONS) as domain.Permission[]) {
      expect(libRbac.hasPermission([role], permission)).toBe(domain.hasPermission([role], permission));
    }
  });

  it("normalizeRoles/isRole behave identically on dirty input", () => {
    const dirty: unknown[] = ["COORDENADOR", "ADMIN", 7, null, undefined, ""];
    expect(libRbac.normalizeRoles(dirty)).toEqual(domain.normalizeRoles(dirty));
    expect(libRbac.isRole("ADMIN")).toBe(domain.isRole("ADMIN"));
  });
});

describe("lib/auth/features keeps the exact pre-refactor contract", () => {
  it("FEATURE_ACCESS is the domain matrix, not a copy", () => {
    expect(libFeatures.FEATURE_ACCESS).toBe(domain.FEATURE_ACCESS);
    expect(Object.keys(libFeatures.FEATURE_ACCESS)).toHaveLength(25);
  });

  it("hasFeatureAccess / hasAnyRole / hasAllRoles are the domain functions", () => {
    expect(libFeatures.hasFeatureAccess).toBe(domain.hasFeatureAccess);
    expect(libFeatures.hasAnyRole).toBe(domain.hasAnyRole);
    expect(libFeatures.hasAllRoles).toBe(domain.hasAllRoles);
  });

  it.each(ROLE_PAIRS)("feature decisions agree with the domain for %s", (_label, role) => {
    for (const feature of Object.keys(domain.FEATURE_ACCESS) as domain.FeatureAccess[]) {
      expect(libFeatures.hasFeatureAccess([role], feature)).toBe(
        domain.hasFeatureAccess([role], feature),
      );
    }
  });

  it("getPrimaryRole keeps the presentation priority and the USUARIO fallback", () => {
    expect(libFeatures.getPrimaryRole(["VOLUNTARIO", "COORDENADOR"])).toBe("COORDENADOR");
    expect(libFeatures.getPrimaryRole(["VOLUNTARIO", "GERENTE_PROJETO"])).toBe("GERENTE_PROJETO");
    expect(libFeatures.getPrimaryRole(["ADMIN"])).toBe("USUARIO");
    expect(libFeatures.getPrimaryRole(undefined)).toBe("USUARIO");
    expect(libFeatures.getRoleDisplayName("GERENTE_PROJETO")).toBe("Gerente de Projeto");
    expect(libFeatures.getRoleDisplayName("DESCONHECIDO")).toBe("DESCONHECIDO");
  });
});
