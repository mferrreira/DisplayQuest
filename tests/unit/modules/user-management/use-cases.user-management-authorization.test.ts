/**
 * B6-4 (D4) — a autorização dos use cases de user-management, decidida sobre o MÓDULO REAL
 * (os próprios use cases) montado sobre portas falsas em memória. O arquivo irmão
 * (use-cases.user-management.test.ts) exercita as REGRAS internas com um ator que sempre passa;
 * este aqui fixa a NEGACAO: quem decide, com qual mensagem, e em que ordem em relacao a lookup
 * e validacao.
 *
 * Ordens e mensagens congeladas (medidas nas rotas legado antes do movimento):
 *  - create: "Sem permissão para criar usuários" (propria), gate ANTES da validacao de entrada.
 *  - find/update: self || MANAGE_USERS, default "Acesso negado"; profile usa "Não autorizado".
 *  - delete/points/roles/status: MANAGE_USERS PURO — o DONO NAO passa (medido: as rotas
 *    gateavam ensurePermission puro; self so vale nas rotas self-or-manage).
 *  - approve (lista + moderacao): "Acesso negado." com PONTO FINAL.
 *  - delete: gate ANTES do lookup — ausente PARA quem nao pode e 403, nao 404.
 *  - update (PUT): gate + TRAVA DE CAMPOS (filterSelfEditableUserFields) — quem nao gerencia
 *    escreve so os seis campos self-editaveis.
 *  - moderate reject: o deleteUser interno recebe o MESMO ator (DEC-54 — quem tem pessoa atras
 *    entrega a pessoa).
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  CREATE_USER_DENIED_MESSAGE,
  ForbiddenError,
  PENDING_MODERATION_DENIED_MESSAGE,
  PROFILE_DENIED_MESSAGE,
  SYSTEM_REASONS,
  systemActor,
  userActor,
} from "@/backend/domain";
import { AssertCanManageUsersUseCase } from "@/backend/modules/user-management/application/use-cases/assert-can-manage-users.use-case";
import { CreateUserUseCase } from "@/backend/modules/user-management/application/use-cases/create-user.use-case";
import { DeleteUserUseCase } from "@/backend/modules/user-management/application/use-cases/delete-user.use-case";
import { FindUserByIdUseCase } from "@/backend/modules/user-management/application/use-cases/find-user-by-id.use-case";
import { ListPendingUsersUseCase } from "@/backend/modules/user-management/application/use-cases/list-pending-users.use-case";
import { ListUsersForActorUseCase } from "@/backend/modules/user-management/application/use-cases/list-users-for-actor.use-case";
import { ModeratePendingUserUseCase } from "@/backend/modules/user-management/application/use-cases/moderate-pending-user.use-case";
import { UpdateUserUseCase } from "@/backend/modules/user-management/application/use-cases/update-user.use-case";
import { UpdateUserPointsUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-points.use-case";
import { UpdateUserProfileUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-profile.use-case";
import { UpdateUserRolesUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-roles.use-case";
import { UpdateUserStatusUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-status.use-case";
import type { PasswordHasher } from "@/backend/modules/user-management/application/ports/password-hasher";
import type { UserRecord, UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository";

const FROZEN_LIST_DENIED = "Usuário não tem permissão para visualizar outros usuários";

const voluntario = userActor(1, ["VOLUNTARIO"]); // dono do id 1
const stranger = userActor(99, ["VOLUNTARIO"]); // sem gestao, id fora do store
const manager = userActor(999, ["COORDENADOR"]); // MANAGE_USERS, id fora do store

function makeFixture() {
  const store: UserRecord[] = [
    {
      id: 1, name: "Ana", email: "ana@x.com", points: 0, completedTasks: 0,
      password: "hashed", status: "active", weekHours: 10, currentWeekHours: 0,
      profileVisibility: "public", bio: null, avatar: null, roles: ["VOLUNTARIO"],
    },
    {
      id: 4, name: "Bruno", email: "bruno@x.com", points: 0, completedTasks: 0,
      password: "hashed", status: "pending", weekHours: 0, currentWeekHours: 0,
      profileVisibility: "public", bio: null, avatar: null, roles: [],
    },
  ];
  const writes: string[] = [];

  const repository = {
    async findById(id: number) {
      return store.find((u) => u.id === id) ?? null;
    },
    async findByEmail(email: string) {
      return store.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) ?? null;
    },
    async create(data: Record<string, unknown>) {
      writes.push(`create:${data.email}`);
      const created = { id: 90 + store.length, ...data } as UserRecord;
      store.push(created);
      return created;
    },
    async update(record: UserRecord) {
      writes.push(`update:${record.id}`);
      const index = store.findIndex((u) => u.id === record.id);
      store[index] = record;
      return record;
    },
    async delete(id: number) {
      writes.push(`delete:${id}`);
      store.splice(store.findIndex((u) => u.id === id), 1);
    },
    async countBlockingDependencies() {
      return 0;
    },
    async findPending() {
      return store.filter((u) => u.status === "pending");
    },
    async findActiveUsers() {
      return store.filter((u) => u.status === "active");
    },
  } as unknown as UserRepositoryPort;

  const hasher: PasswordHasher = {
    async hash() {
      return "hashed";
    },
  };

  return { store, writes, repository, hasher };
}

let fakes: ReturnType<typeof makeFixture>;
beforeEach(() => {
  fakes = makeFixture();
});

describe("CreateUserUseCase — gate MANAGE_USERS com mensagem própria (B6-4)", () => {
  it("VOLUNTARIO recebe 403 com a mensagem própria e nada é escrito", async () => {
    await expect(
      new CreateUserUseCase(fakes.repository, fakes.hasher).execute({
        actor: voluntario, name: "Novo", email: "n@x.com", password: "secret123", roles: [], weekHours: 0,
      }),
    ).rejects.toThrow(CREATE_USER_DENIED_MESSAGE);
    expect(fakes.writes).toEqual([]);
  });

  it("gate vem ANTES da validação: payload inválido para quem não pode é 403, não 400", async () => {
    await expect(
      new CreateUserUseCase(fakes.repository, fakes.hasher).execute({
        actor: stranger, name: "", email: " ", password: "1", roles: [], weekHours: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("COORDENADOR cria (o gate não é o caminho público — registerUser segue sem gate)", async () => {
    const created = await new CreateUserUseCase(fakes.repository, fakes.hasher).execute({
      actor: manager, name: "Novo", email: "n@x.com", password: "secret123", roles: [], weekHours: 0,
    });
    expect(created).toMatchObject({ email: "n@x.com" });
    expect(fakes.writes).toEqual(["create:n@x.com"]);
  });
});

describe("ListUsersForActorUseCase — visibilidade lida do ActorRef (B6-4)", () => {
  it("systemActor NÃO tem papéis e cai na negação congelada (nenhuma rotina chama este use case)", async () => {
    await expect(
      new ListUsersForActorUseCase(fakes.repository).execute({ actor: systemActor(SYSTEM_REASONS.WEEKLY_RESET) }),
    ).rejects.toThrow(FROZEN_LIST_DENIED);
  });

  it("VOLUNTARIO vê a lista básica (sem email/bio); COORDENADOR vê a completa", async () => {
    const basic = await new ListUsersForActorUseCase(fakes.repository).execute({ actor: voluntario });
    expect(basic).toHaveLength(1);
    expect(basic[0]).not.toHaveProperty("email");
    expect(basic[0]).not.toHaveProperty("bio");

    const full = await new ListUsersForActorUseCase(fakes.repository).execute({ actor: manager });
    expect(full[0]).toHaveProperty("email");
    expect(full[0]).toHaveProperty("bio");
  });
});

describe("FindUserByIdUseCase — self || MANAGE_USERS com mensagem por rota (B6-4)", () => {
  it("VOLUNTARIO lendo OUTRO é barrado com o default 'Acesso negado' (rota users/[id])", async () => {
    await expect(
      new FindUserByIdUseCase(fakes.repository).execute(stranger, 1),
    ).rejects.toThrow("Acesso negado");
  });

  it("o dono lê a si mesmo; MANAGE_USERS lê qualquer um", async () => {
    await expect(new FindUserByIdUseCase(fakes.repository).execute(voluntario, 1)).resolves
      .toMatchObject({ id: 1 });
    await expect(new FindUserByIdUseCase(fakes.repository).execute(manager, 1)).resolves
      .toMatchObject({ id: 1 });
  });

  it("a rota profile passa a MENSAGEM PRÓPRIA 'Não autorizado' para a MESMA regra", async () => {
    await expect(
      new FindUserByIdUseCase(fakes.repository).execute(stranger, 1, PROFILE_DENIED_MESSAGE),
    ).rejects.toThrow(PROFILE_DENIED_MESSAGE);
  });
});

describe("UpdateUserUseCase — gate + trava de campos (B6-4)", () => {
  it("VOLUNTARIO editando a SI MESMO escreve só os campos self-editáveis: roles/status/weekHours NÃO passam", async () => {
    const updated = await new UpdateUserUseCase(fakes.repository).execute(voluntario, 1, {
      name: "Novo Nome",
      roles: ["ADMIN"],
      status: "active",
      weekHours: 99,
    });
    expect(updated).toMatchObject({ name: "Novo Nome", roles: ["VOLUNTARIO"], status: "active", weekHours: 10 });
  });

  it("VOLUNTARIO editando OUTRO é barrado antes de qualquer escrita", async () => {
    await expect(
      new UpdateUserUseCase(fakes.repository).execute(stranger, 1, { name: "X" }),
    ).rejects.toThrow("Acesso negado");
    expect(fakes.writes).toEqual([]);
  });

  it("COORDENADOR escreve os campos de gestão (roles passam)", async () => {
    const updated = await new UpdateUserUseCase(fakes.repository).execute(manager, 1, {
      roles: ["PESQUISADOR"],
    });
    expect(updated).toMatchObject({ roles: ["PESQUISADOR"] });
  });
});

describe("DeleteUserUseCase — MANAGE_USERS PURO, gate antes do lookup (B6-4)", () => {
  it("o DONO não exclui a si mesmo: exclusão não é caminho self (DEC-55)", async () => {
    await expect(new DeleteUserUseCase(fakes.repository).execute(voluntario, 1)).rejects.toThrow("Acesso negado");
  });

  it("ausente PARA quem não pode é 403, não 404 (gate antes do lookup, ordem medida)", async () => {
    await expect(new DeleteUserUseCase(fakes.repository).execute(stranger, 99)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("COORDENADOR exclui", async () => {
    await new DeleteUserUseCase(fakes.repository).execute(manager, 4);
    expect(fakes.writes).toEqual(["delete:4"]);
  });
});

describe("ListPendingUsersUseCase / ModeratePendingUserUseCase — 'Acesso negado.' com ponto final (B6-4)", () => {
  it("VOLUNTARIO na fila é barrado com a mensagem própria (ponto final congelado)", async () => {
    await expect(new ListPendingUsersUseCase(fakes.repository).execute(stranger)).rejects.toThrow(PENDING_MODERATION_DENIED_MESSAGE);
    await expect(
      new ModeratePendingUserUseCase(fakes.repository, new DeleteUserUseCase(fakes.repository)).execute(stranger, 4, "approve"),
    ).rejects.toThrow(PENDING_MODERATION_DENIED_MESSAGE);
  });

  it("COORDENADOR aprova; o REJECT delega no DeleteUserUseCase com o MESMO ator (DEC-54)", async () => {
    const moderate = () =>
      new ModeratePendingUserUseCase(fakes.repository, new DeleteUserUseCase(fakes.repository));
    const approved = await moderate().execute(manager, 4, "approve");
    expect(approved).toMatchObject({ id: 4, status: "active" });

    await moderate().execute(manager, 1, "reject");
    expect(fakes.writes).toContain("delete:1");
  });
});

describe("UpdateUserProfileUseCase — self || MANAGE_USERS com 'Não autorizado' (B6-4)", () => {
  it("VOLUNTARIO editando OUTRO leva a mensagem própria", async () => {
    await expect(
      new UpdateUserProfileUseCase(fakes.repository, fakes.hasher).execute(stranger, 1, { name: "X" }),
    ).rejects.toThrow(PROFILE_DENIED_MESSAGE);
  });

  it("o dono edita o próprio perfil", async () => {
    const updated = await new UpdateUserProfileUseCase(fakes.repository, fakes.hasher).execute(voluntario, 1, {
      name: "Ana Nova",
    });
    expect(updated).toMatchObject({ name: "Ana Nova" });
  });
});

describe("UpdateUserPoints/Roles/StatusUseCase — MANAGE_USERS PURO (B6-4)", () => {
  it("nem o DONO passa: points/roles/status são gestão, não self (ordem medida nas rotas)", async () => {
    await expect(
      new UpdateUserPointsUseCase(fakes.repository).execute({ actor: voluntario, userId: 1, action: "set", points: 5 }),
    ).rejects.toThrow("Acesso negado");
    await expect(
      new UpdateUserRolesUseCase(fakes.repository).execute({ actor: voluntario, userId: 1, action: "set", roles: [] }),
    ).rejects.toThrow("Acesso negado");
    await expect(
      new UpdateUserStatusUseCase(fakes.repository).execute({ actor: voluntario, userId: 1, action: "activate" }),
    ).rejects.toThrow("Acesso negado");
    expect(fakes.writes).toEqual([]);
  });

  it("COORDENADOR passa nos três", async () => {
    await expect(
      new UpdateUserPointsUseCase(fakes.repository).execute({ actor: manager, userId: 1, action: "set", points: -20 }),
    ).resolves.toMatchObject({ points: -20 }); // DEC-60: set aceita negativo
    await expect(
      new UpdateUserRolesUseCase(fakes.repository).execute({ actor: manager, userId: 1, action: "add", role: "PESQUISADOR" }),
    ).resolves.toMatchObject({ roles: ["VOLUNTARIO", "PESQUISADOR"] });
    await expect(
      new UpdateUserStatusUseCase(fakes.repository).execute({ actor: manager, userId: 1, action: "suspend" }),
    ).resolves.toMatchObject({ status: "suspended" });
  });
});

describe("AssertCanManageUsersUseCase — o assert 403-antes-do-parse/validação (B6-4)", () => {
  it("decide sem tocar porta nenhuma, com as três mensagens congeladas", () => {
    const assert = new AssertCanManageUsersUseCase();
    expect(() => assert.execute({ actor: stranger })).toThrow("Acesso negado");
    expect(() => assert.execute({ actor: stranger, deniedMessage: PENDING_MODERATION_DENIED_MESSAGE })).toThrow(
      "Acesso negado.",
    );
    expect(() => assert.execute({ actor: stranger, deniedMessage: CREATE_USER_DENIED_MESSAGE })).toThrow(
      CREATE_USER_DENIED_MESSAGE,
    );
    expect(() => assert.execute({ actor: manager })).not.toThrow();
    expect(fakes.writes).toEqual([]);
  });

  it("systemActor PASSA — é o bypass declarado do DEC-54; o que impede rota de usá-lo é o guarda system-actor.test.ts (grep de 'systemActor(' em app/api/**)", () => {
    expect(() => new AssertCanManageUsersUseCase().execute({ actor: systemActor(SYSTEM_REASONS.WEEKLY_RESET) })).not.toThrow();
  });
});
