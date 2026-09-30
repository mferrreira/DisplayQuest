// @vitest-environment node
/**
 * OND2-B4 — G4 roundtrip smoke of the user-management module against the ISOLATED test DB
 * (127.0.0.1:5433 — DEC-10/BLOCKER-02; never 5432).
 *
 * Exercises the NEW wiring end-to-end with real Prisma and real bcrypt (no mocks):
 *   registerUser -> listPendingUsers -> moderatePendingUser(approve) -> listUsersForActor ->
 *   updateUserPoints -> updateUserRoles -> deductUserHours -> updateUserStatus -> deleteUser
 * using `createUserManagementModule()` exactly as the composition root builds it
 * (use cases over PrismaUserRepository + BcryptPasswordHasher).
 *
 * Only rows created by this file are deleted in afterAll; seeded data is left in place.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createUserManagementModule } from "@/backend/modules/user-management";

const userModule = createUserManagementModule();
const uniqueEmail = `g4-users-${Date.now()}@test.local`;
const createdUserIds: number[] = [];
let userId = 0;

describe("G4 roundtrip — user-management (isolated test DB)", () => {
  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.users.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  it("registerUser persists a pending user with a real bcrypt hash and NO password in the output", async () => {
    const created = (await userModule.registerUser({
      name: "  G4 Volunteer  ",
      email: `  ${uniqueEmail.toUpperCase()} `,
      password: "g4-secret123",
    })) as Record<string, unknown>;

    expect(created).not.toHaveProperty("password");
    expect(created.status).toBe("pending");
    expect(created.email).toBe(uniqueEmail);
    expect(created.name).toBe("G4 Volunteer");
    userId = created.id as number;
    createdUserIds.push(userId);

    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.status).toBe("pending");
    expect(row?.roles).toEqual([]);
    expect(row?.password?.startsWith("$2")).toBe(true); // real bcrypt, not the test fake

    await expect(
      userModule.registerUser({ name: "Dup", email: uniqueEmail, password: "g4-secret123" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("moderation queue: listPendingUsers -> approve activates", async () => {
    const pending = (await userModule.listPendingUsers()) as Array<Record<string, unknown>>;
    expect(pending.some((user) => user.id === userId)).toBe(true);
    expect(pending[0]).not.toHaveProperty("password");

    const approved = (await userModule.moderatePendingUser(userId, "approve")) as { status: string };
    expect(approved.status).toBe("active");
    expect((await prisma.users.findUnique({ where: { id: userId } }))?.status).toBe("active");
  });

  it("listUsersForActor (COORDENADOR) includes the new active user with email+bio fields", async () => {
    const rows = (await userModule.listUsersForActor({ actorRoles: ["COORDENADOR"] })) as Array<
      Record<string, unknown>
    >;
    const mine = rows.find((row) => row.id === userId);
    expect(mine).toBeDefined();
    expect(mine?.email).toBe(uniqueEmail);
    expect(mine).toHaveProperty("bio");
    expect(mine).not.toHaveProperty("password");

    const basic = (await userModule.listUsersForActor({ actorRoles: ["VOLUNTARIO"] })) as Array<
      Record<string, unknown>
    >;
    const basicMine = basic.find((row) => row.id === userId);
    expect(basicMine).toBeDefined();
    expect(basicMine).not.toHaveProperty("email");
  });

  it("points/roles/hours/status mutations persist and project the public shape", async () => {
    const withPoints = (await userModule.updateUserPoints({ userId, action: "add", points: 7 })) as {
      points: number;
    };
    expect(withPoints.points).toBe(7);

    const withRoles = (await userModule.updateUserRoles({
      userId,
      action: "add",
      role: "PESQUISADOR",
    })) as { roles: string[] };
    expect(withRoles.roles).toEqual(["PESQUISADOR"]);

    // harness setup: give the user a schedule the way the admin UI does (updateUser),
    // and currentWeekHours the way the work-session flow does (direct row write).
    await userModule.updateUser(userId, { weekHours: 10 });
    await prisma.users.update({ where: { id: userId }, data: { currentWeekHours: 8 } });

    const deducted = (await userModule.deductUserHours({
      userId,
      hours: 5,
      reason: "g4 smoke",
      deductedBy: 1,
      deductedByRoles: ["COORDENADOR"],
    })) as { message: string; user: { weekHours: number; currentWeekHours: number } };
    expect(deducted.message).toBe("5 horas retiradas com sucesso");
    expect(deducted.user.weekHours).toBe(5);
    expect(deducted.user.currentWeekHours).toBe(5); // clamped

    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.weekHours).toBe(5);
    expect(row?.currentWeekHours).toBe(5);
    expect(row?.points).toBe(7);

    const suspended = (await userModule.updateUserStatus({ userId, action: "suspend" })) as {
      status: string;
    };
    expect(suspended.status).toBe("suspended");
  });

  it("deleteUser removes the row; a second delete raises NotFoundError", async () => {
    await userModule.deleteUser(userId);
    expect(await prisma.users.findUnique({ where: { id: userId } })).toBeNull();
    await expect(userModule.deleteUser(userId)).rejects.toThrow("Usuário não encontrado");
  });
});
