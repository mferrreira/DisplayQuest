// @vitest-environment node
/**
 * OND2-B2 (R2) — pure domain rules moved out of UserServiceGateway into backend/domain/identity:
 * the avatar A11 allow-list, the user-list field visibility matrix and the public projection.
 * These are the rules the use cases consume; frozen by the golden matrix (OND2-B1).
 */
import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  ValidationError,
  normalizeAvatar,
  resolveUserListVisibility,
  toPublicUser,
  toPublicUserWithCpf,
} from "@/backend/domain";

describe("normalizeAvatar — A11 allow-list (pure)", () => {
  it("null/empty/whitespace -> null", () => {
    expect(normalizeAvatar(null)).toBeNull();
    expect(normalizeAvatar("")).toBeNull();
    expect(normalizeAvatar("   ")).toBeNull();
    expect(normalizeAvatar(undefined)).toBeNull();
  });

  it("internal prefixes pass unchanged", () => {
    expect(normalizeAvatar("/uploads/avatars/a.png")).toBe("/uploads/avatars/a.png");
    expect(normalizeAvatar("/api/uploads/avatars/b.webp")).toBe("/api/uploads/avatars/b.webp");
    expect(normalizeAvatar("  /uploads/avatars/c.png  ")).toBe("/uploads/avatars/c.png");
  });

  it("external, protocol-relative, traversal and foreign paths -> ValidationError (400, frozen message)", () => {
    for (const raw of [
      "https://evil.com/a.png",
      "//evil.com/a.png",
      "uploads/avatars/x.png",
      "/uploads/avatars/../secret",
      "/other/path.png",
      "/uploads/avatarsx/y.png",
    ]) {
      expect(() => normalizeAvatar(raw), raw).toThrowError(ValidationError);
      expect(() => normalizeAvatar(raw), raw).toThrow("Imagem de perfil inválida");
    }
  });
});

describe("resolveUserListVisibility — field visibility matrix (pure)", () => {
  it("COORDENADOR/GERENTE: full (email + bio)", () => {
    for (const role of ["COORDENADOR", "GERENTE"]) {
      expect(resolveUserListVisibility([role])).toEqual({
        canViewFullUsers: true,
        canManageProjectMembers: false,
        canViewBasicUsers: true,
      });
    }
  });

  it("GERENTE_PROJETO: email yes, bio no", () => {
    expect(resolveUserListVisibility(["GERENTE_PROJETO"])).toEqual({
      canViewFullUsers: false,
      canManageProjectMembers: true,
      canViewBasicUsers: true,
    });
  });

  it("basic-only roles", () => {
    for (const role of ["PESQUISADOR", "VOLUNTARIO", "COLABORADOR", "LABORATORISTA"]) {
      expect(resolveUserListVisibility([role]).canViewBasicUsers, role).toBe(true);
      expect(resolveUserListVisibility([role]).canViewFullUsers, role).toBe(false);
    }
  });

  it("unknown/empty roles: no visibility at all", () => {
    expect(resolveUserListVisibility([]).canViewBasicUsers).toBe(false);
    expect(resolveUserListVisibility(["NAO_EXISTENTE"]).canViewBasicUsers).toBe(false);
  });

  it("any full/manage role wins over basic-only roles", () => {
    expect(resolveUserListVisibility(["VOLUNTARIO", "COORDENADOR"]).canViewFullUsers).toBe(true);
  });
});

describe("toPublicUser — password never leaves the record", () => {
  it("projects exactly the transport fields", () => {
    const record = {
      id: 1,
      name: "Ana",
      email: "ana@x.com",
      points: 10,
      completedTasks: 2,
      password: "bcrypt:secret",
      status: "active",
      weekHours: 10,
      currentWeekHours: 8,
      profileVisibility: "public" as const,
      bio: null,
      avatar: null,
      roles: ["VOLUNTARIO" as const],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const publicUser = toPublicUser(record as never);

    expect(publicUser).not.toHaveProperty("password");
    expect(Object.keys(publicUser).sort()).toEqual(
      [
        "id",
        "name",
        "email",
        "points",
        "completedTasks",
        "status",
        "weekHours",
        "currentWeekHours",
        // plan-v9 (ADR-001, DEC-224): placar do mes em curso. `points` continua o saldo; este e o
        // numero que o Quadro de Lideranca ordena. A entrada e opcional (fixtures e chamadores
        // antigos), a saida e sempre presente.
        "currentMonthPoints",
        "profileVisibility",
        "bio",
        "avatar",
        // V5-3 (DEC-137): a chave da capa do perfil entra no transporte. O record de cima NAO tem a
        // coluna — a entrada e opcional justamente para chamadores e fixtures que ainda nao a
        // conhecem, e a saida e sempre presente.
        "bannerKey",
        // V5-4a (DEC-138): os dados de pessoa que a leitura aberta do perfil mostra. O `cpf` nao
        // esta aqui de proposito — e o unico campo com leitura restrita, e sai so por
        // `toPublicUserWithCpf`, chamada depois de `canActorReadUserCpf` responder "sim".
        "registrationNumber",
        "course",
        "scholarshipType",
        "fundingAgency",
        "fundingAgencyOther",
        "level",
        "roles",
        "createdAt",
      ].sort(),
    );
    expect(publicUser.bannerKey).toBeNull();
    expect(publicUser.course).toBeNull();
    expect(publicUser).not.toHaveProperty("cpf");

    const withBanner = toPublicUser({ ...record, bannerKey: "users/1/images/banner/abc.png" } as never);
    expect(withBanner.bannerKey).toBe("users/1/images/banner/abc.png");
  });

  it("a projeção com CPF é outro caminho, e o CPF cru não passa por toPublicUser", () => {
    const record = {
      id: 1,
      name: "Ana",
      email: "ana@x.com",
      points: 10,
      completedTasks: 2,
      password: "bcrypt:secret",
      status: "active",
      weekHours: 10,
      currentWeekHours: 8,
      profileVisibility: "public" as const,
      bio: null,
      avatar: null,
      bannerKey: null,
      cpf: "52998224725",
      course: "Sistemas de Informação",
      roles: ["VOLUNTARIO" as const],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    // O mesmo record, pelas duas projeções: a aberta ignora o CPF que esta na mão.
    expect(toPublicUser(record as never)).not.toHaveProperty("cpf");

    const restricted = toPublicUserWithCpf(record as never);
    expect(restricted.cpf).toBe("52998224725");
    expect(restricted.course).toBe("Sistemas de Informação");
    expect(restricted).not.toHaveProperty("password");

    // Record sem a coluna: a saida continua presente, como null.
    expect(toPublicUserWithCpf({ ...record, cpf: undefined } as never).cpf).toBeNull();
  });
});

describe("domain error wiring", () => {
  it("ForbiddenError default message is the A4 'Acesso negado' used by the gateway", () => {
    expect(new ForbiddenError().message).toBe("Acesso negado");
    expect(new ForbiddenError().status).toBe(403);
  });
});
