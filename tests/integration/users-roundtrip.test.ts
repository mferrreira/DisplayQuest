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
import { ConflictError, userActor } from "@/backend/domain";
import { prisma } from "@/lib/database/prisma";
import { createUserManagementModule } from "@/backend/modules/user-management";

const userModule = createUserManagementModule();
/**
 * B6-4 (D4): os metodos do modulo passaram a exigir ator. O harness usa um COORDENADOR
 * (MANAGE_USERS) — este arquivo exercita o fluxo de administracao (moderar, pontuar, mudar
 * roles/status, excluir); a negacao por papel e provada nos testes de autorizacao do lote.
 */
const managerActor = userActor(1, ["COORDENADOR"]);
const uniqueEmail = `g4-users-${Date.now()}@test.local`;
const createdUserIds: number[] = [];
/** V4-1: tarefas criadas para o caso de dependência. Apagadas ANTES dos usuários. */
const dependentTaskIds: number[] = [];
let userId = 0;

describe("G4 roundtrip — user-management (isolated test DB)", () => {
  afterAll(async () => {
    // Ordem importa: as tarefas apontam para o usuário por FK RESTRICT.
    if (dependentTaskIds.length > 0) {
      await prisma.tasks.deleteMany({ where: { id: { in: dependentTaskIds } } });
    }
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
    const pending = (await userModule.listPendingUsers(managerActor)) as Array<Record<string, unknown>>;
    expect(pending.some((user) => user.id === userId)).toBe(true);
    expect(pending[0]).not.toHaveProperty("password");

    const approved = (await userModule.moderatePendingUser(managerActor, userId, "approve")) as { status: string };
    expect(approved.status).toBe("active");
    expect((await prisma.users.findUnique({ where: { id: userId } }))?.status).toBe("active");
  });

  it("listUsersForActor (COORDENADOR) includes the new active user with email+bio fields", async () => {
    const rows = (await userModule.listUsersForActor({ actor: userActor(1, ["COORDENADOR"]) })) as Array<
      Record<string, unknown>
    >;
    const mine = rows.find((row) => row.id === userId);
    expect(mine).toBeDefined();
    expect(mine?.email).toBe(uniqueEmail);
    expect(mine).toHaveProperty("bio");
    expect(mine).not.toHaveProperty("password");

    const basic = (await userModule.listUsersForActor({ actor: userActor(1, ["VOLUNTARIO"]) })) as Array<
      Record<string, unknown>
    >;
    const basicMine = basic.find((row) => row.id === userId);
    expect(basicMine).toBeDefined();
    expect(basicMine).not.toHaveProperty("email");
    // V5-3 (DEC-137): a capa chega na MESMA lista que o avatar, porque é o pódio do ranking que a
    // renderiza — sem isto a tela teria que chamar uma rota por pessoa.
    expect(basicMine).toHaveProperty("bannerKey", null);
  });

  it("capa do perfil: a coluna guarda a CHAVE do bucket, e o roundtrip roda sem bucket no ar", async () => {
    // DEC-133/137: o módulo guarda registro + autorização; quem move byte é a rota pelo seam. É por
    // isso que este roundtrip de Prisma real não precisa de SeaweedFS no ar.
    const owner = userActor(userId, ["VOLUNTARIO"]);
    const key = `users/${userId}/images/banner/g4-roundtrip.png`;

    const written = await userModule.updateUserImage({ actor: owner, userId, slot: "banner", blobKey: key });
    expect(written.previousKey).toBeNull();
    expect(written.user.bannerKey).toBe(key);
    expect(written.user).not.toHaveProperty("password");

    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.bannerKey).toBe(key);

    // Leitura é do autenticado: outra pessoa lê a chave (DEC-127/136).
    const read = await userModule.getUserImage({ actor: userActor(1, ["VOLUNTARIO"]), userId, slot: "banner" });
    expect(read).toEqual({ slot: "banner", blobKey: key });

    // Trocar/tirar devolve a chave ANTERIOR — é ela que a rota remove do bucket.
    const cleared = await userModule.updateUserImage({ actor: managerActor, userId, slot: "banner", blobKey: null });
    expect(cleared.previousKey).toBe(key);
    expect(cleared.user.bannerKey).toBeNull();
    expect((await prisma.users.findUnique({ where: { id: userId } }))?.bannerKey).toBeNull();

    // Slot sem capa responde com o 404 do domínio, não um objeto vazio.
    await expect(userModule.getUserImage({ actor: owner, userId, slot: "banner" })).rejects.toThrow(
      "Imagem não encontrada",
    );
  });

  it("dados de pessoa (DEC-138): normalização persiste na coluna, e o CPF só chega a quem tem direito", async () => {
    const owner = userActor(userId, ["VOLUNTARIO"]);

    const written = (await userModule.updateUserProfile(owner, userId, {
      cpf: "529.982.247-25",
      registrationNumber: "  G4-2026  ",
      course: "Sistemas de Informação",
      scholarshipType: "PIBIC Jr",
      fundingAgency: "OUTRA",
      fundingAgencyOther: "FAPEMIG",
      level: "Pós-graduação",
    })) as {
      cpf: string | null;
      registrationNumber: string | null;
      course: string | null;
      scholarshipType: string | null;
      fundingAgency: string | null;
      fundingAgencyOther: string | null;
      level: string | null;
    };

    expect(written.cpf).toBe("52998224725");
    expect(written.scholarshipType).toBe("PIBIC_JR");
    expect(written.level).toBe("POS_GRADUACAO");

    // Prisma real: o que está na coluna é o token normalizado, não a grafia que chegou.
    const row = await prisma.users.findUnique({ where: { id: userId } });
    expect(row?.cpf).toBe("52998224725");
    expect(row?.registrationNumber).toBe("G4-2026");
    expect(row?.course).toBe("Sistemas de Informação");
    expect(row?.fundingAgency).toBe("OUTRA");
    expect(row?.fundingAgencyOther).toBe("FAPEMIG");

    // Leitura de um usuário: a própria pessoa lê o próprio CPF.
    const selfRead = (await userModule.findUserById(owner, userId)) as { cpf?: string | null } | null;
    expect(selfRead?.cpf).toBe("52998224725");

    // Lista: quem não gerencia contas vê os campos abertos e NÃO vê o CPF.
    const basic = (await userModule.listUsersForActor({ actor: userActor(1, ["VOLUNTARIO"]) })) as Array<
      Record<string, unknown>
    >;
    const basicMine = basic.find((r) => r.id === userId);
    expect(basicMine?.course).toBe("Sistemas de Informação");
    expect(basicMine).not.toHaveProperty("cpf");

    // Lista: a gestão vê o CPF, porque é ali que o painel o edita.
    const full = (await userModule.listUsersForActor({ actor: managerActor })) as Array<
      Record<string, unknown>
    >;
    expect(full.find((r) => r.id === userId)?.cpf).toBe("52998224725");

    // Trocar o fomento para uma agência nomeada apaga o texto livre (o formulário não tem os dois).
    const switched = (await userModule.updateUserProfile(owner, userId, {
      fundingAgency: "CNPQ",
    })) as { fundingAgency: string | null; fundingAgencyOther: string | null };
    expect(switched.fundingAgencyOther).toBeNull();
    expect((await prisma.users.findUnique({ where: { id: userId } }))?.fundingAgencyOther).toBeNull();

    // CPF inválido não chega ao banco.
    await expect(
      userModule.updateUserProfile(owner, userId, { cpf: "529.982.247-26" })
    ).rejects.toThrow("CPF inválido");
    expect((await prisma.users.findUnique({ where: { id: userId } }))?.cpf).toBe("52998224725");
  });

  it("points/roles/hours/status mutations persist and project the public shape", async () => {
    const withPoints = (await userModule.updateUserPoints({ actor: managerActor, userId, action: "add", points: 7 })) as {
      points: number;
    };
    expect(withPoints.points).toBe(7);

    const withRoles = (await userModule.updateUserRoles({
      actor: managerActor,
      userId,
      action: "add",
      role: "PESQUISADOR",
    })) as { roles: string[] };
    expect(withRoles.roles).toEqual(["PESQUISADOR"]);

    // harness setup: give the user a schedule the way the admin UI does (updateUser),
    // and currentWeekHours the way the work-session flow does (direct row write).
    // weekHours NAO e campo self-editavel — por isso o ator aqui e o manager.
    await userModule.updateUser(managerActor, userId, { weekHours: 10 });
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

    const suspended = (await userModule.updateUserStatus({ actor: managerActor, userId, action: "suspend" })) as {
      status: string;
    };
    expect(suspended.status).toBe("suspended");
  });

  it("deleteUser removes the row; a second delete raises NotFoundError", async () => {
    await userModule.deleteUser(managerActor, userId);
    expect(await prisma.users.findUnique({ where: { id: userId } })).toBeNull();
    await expect(userModule.deleteUser(managerActor, userId)).rejects.toThrow("Usuário não encontrado");
  });

  /**
   * V4-1 (DEC-55) — a recusa contada contra o Prisma real, não contra uma porta falsa.
   *
   * O que este caso prova que o teste de unidade não pode provar: que as 13 contagens de
   * `countBlockingDependencies` apontam para colunas que EXISTEM e encontram a linha certa. Um
   * nome de coluna errado seria pego pelo `tsc` (o cliente Prisma é tipado), mas uma TABELA
   * esquecida não seria pega por nada — daí o guarda de deriva em
   * `tests/unit/modules/user-management/user-delete-schema-drift.test.ts`.
   *
   * A tarefa é apagada antes do usuário no `afterAll`: `tasks.assignedTo` é RESTRICT, então
   * deixar a linha pendurada faria o próprio `users.deleteMany` de limpeza falhar com P2003.
   */
  it("deleteUser recusa com ConflictError quando o usuário tem histórico (Prisma real)", async () => {
    const withHistory = (await userModule.registerUser({
      name: "G4 Com Historico",
      email: `g4-users-hist-${Date.now()}@test.local`,
      password: "g4-secret123",
    })) as { id: number };
    createdUserIds.push(withHistory.id);

    const task = await prisma.tasks.create({
      data: {
        title: `G4 V4-1 tarefa de ${withHistory.id}`,
        status: "to-do",
        priority: "medium",
        assignedTo: withHistory.id,
        createdBy: withHistory.id,
      },
    });
    dependentTaskIds.push(task.id);

    const error = await userModule.deleteUser(managerActor, withHistory.id).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ status: 409 });
    // O usuário continua lá: a recusa veio antes, não depois de um delete parcial.
    expect(await prisma.users.findUnique({ where: { id: withHistory.id } })).not.toBeNull();
  });
});
