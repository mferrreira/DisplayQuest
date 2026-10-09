// @vitest-environment node
/**
 * OND2-B1 (R0) — golden of `RbacIdentityAccessGateway` (26 lines, the thin RBAC facade).
 * The permission matrices themselves are frozen in _foundations/rbac-policy.test.ts; this
 * file freezes the GATEWAY behavior (normalization + self-or-permission rule) that the
 * cross-module consumers (user-management, task-management, lab-operations,
 * project-management) rely on.
 */
import { describe, expect, it } from "vitest";
import {
  RbacIdentityAccessGateway,
  createIdentityAccessGateway,
} from "@/backend/modules/identity-access/infrastructure/rbac-identity-access.gateway";

describe("golden — RbacIdentityAccessGateway", () => {
  const gateway = new RbacIdentityAccessGateway();

  it("hasPermission: matrix sample + default denial for unknown roles", () => {
    expect(gateway.hasPermission(["COORDENADOR"], "MANAGE_USERS")).toBe(true);
    expect(gateway.hasPermission(["VOLUNTARIO"], "MANAGE_USERS")).toBe(false);
    expect(gateway.hasPermission(["NAO_EXISTENTE"], "MANAGE_USERS")).toBe(false);
    expect(gateway.hasPermission(undefined as never, "MANAGE_USERS")).toBe(false);
  });

  it("hasAnyRole: normalizes garbage and matches any of the requested roles", () => {
    expect(gateway.hasAnyRole(["VOLUNTARIO", 42, null], ["VOLUNTARIO"])).toBe(true);
    expect(gateway.hasAnyRole(["VOLUNTARIO"], ["COORDENADOR", "GERENTE"])).toBe(false);
    expect(gateway.hasAnyRole("não-é-array" as never, ["VOLUNTARIO"])).toBe(false);
  });

  it("canAccessSelfOrPermission: self -> true regardless of roles; else permission decides", () => {
    expect(
      gateway.canAccessSelfOrPermission({
        actor: { id: 7, roles: ["VOLUNTARIO"] },
        ownerUserId: 7,
        permission: "MANAGE_USERS",
      }),
    ).toBe(true);

    expect(
      gateway.canAccessSelfOrPermission({
        actor: { id: 1, roles: ["COORDENADOR"] },
        ownerUserId: 7,
        permission: "MANAGE_USERS",
      }),
    ).toBe(true);

    expect(
      gateway.canAccessSelfOrPermission({
        actor: { id: 1, roles: ["VOLUNTARIO"] },
        ownerUserId: 7,
        permission: "MANAGE_USERS",
      }),
    ).toBe(false);
  });

  it("factory returns the gateway (no dependencies)", () => {
    expect(createIdentityAccessGateway()).toBeInstanceOf(RbacIdentityAccessGateway);
  });
});
