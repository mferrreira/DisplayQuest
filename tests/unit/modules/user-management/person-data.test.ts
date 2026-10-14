/**
 * V5-4a (DEC-138/DEC-140) — a escrita e a leitura dos dados de pessoa nos use cases reais,
 * sobre portas falsas em memória (mesma postura de `user-image-use-cases.test.ts`).
 *
 * O que este arquivo segura:
 *   1. Os dois caminhos de escrita (PUT do painel, PATCH do perfil) normalizam pela MESMA regra
 *      pura, e a normalização decide: grafia de tela vira token, CPF mascarado vira dígito,
 *      valor fora da lista é 400 com a mensagem própria.
 *   2. Quem não gerencia escreve os campos de pessoa (a trava de campos self-editáveis os inclui),
 *      e quem não é a pessoa nem gestão não escreve nada.
 *   3. `agencia_outra` só existe com `is_outra`: escolher CNPq apaga o texto livre.
 *   4. A leitura: o CPF sai na leitura de um usuário (o gate já é self OU MANAGE_USERS) e na
 *      lista sai SÓ para quem tem visão completa; os demais campos de pessoa seguem abertos.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  ForbiddenError,
  PROFILE_DENIED_MESSAGE,
  ValidationError,
  emptyPersonData,
  userActor,
} from "@/backend/domain";
import { FindUserByIdUseCase } from "@/backend/modules/user-management/application/use-cases/find-user-by-id.use-case";
import { ListUsersForActorUseCase } from "@/backend/modules/user-management/application/use-cases/list-users-for-actor.use-case";
import { UpdateUserProfileUseCase } from "@/backend/modules/user-management/application/use-cases/update-user-profile.use-case";
import { UpdateUserUseCase } from "@/backend/modules/user-management/application/use-cases/update-user.use-case";
import type {
  UserRecord,
  UserSummaryRow,
} from "@/backend/modules/user-management/application/ports/user.repository";

const owner = userActor(1, ["VOLUNTARIO"]); // dono do id 1
const stranger = userActor(99, ["VOLUNTARIO"]); // nem a pessoa, nem gestão
const manager = userActor(999, ["COORDENADOR"]); // MANAGE_USERS
const projectManager = userActor(998, ["GERENTE_PROJETO"]); // gerencia projeto, não contas

function userRow(id: number, overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id,
    name: `Pessoa ${id}`,
    email: `pessoa${id}@lab.com`,
    points: 0,
    completedTasks: 0,
    password: "hashed",
    status: "active",
    weekHours: 10,
    currentWeekHours: 0,
    profileVisibility: "public",
    bio: null,
    avatar: null,
    bannerKey: null,
    ...emptyPersonData(),
    roles: ["VOLUNTARIO"],
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    ...overrides,
  };
}

function summaryRow(id: number, overrides: Partial<UserSummaryRow> = {}): UserSummaryRow {
  return {
    id,
    name: `Pessoa ${id}`,
    email: `pessoa${id}@lab.com`,
    roles: ["VOLUNTARIO"],
    status: "active",
    weekHours: 10,
    points: 0,
    completedTasks: 0,
    avatar: null,
    bio: null,
    bannerKey: null,
    ...emptyPersonData(),
    ...overrides,
  };
}

function makeFixture(rows: UserRecord[] = [userRow(1)]) {
  const store = new Map(rows.map((row) => [row.id, row]));
  const writes: UserRecord[] = [];

  const repository = {
    // Cópia na leitura: o use case muta o record antes de gravar.
    async findById(id: number) {
      const row = store.get(id);
      return row ? { ...row } : null;
    },
    async update(record: UserRecord) {
      writes.push(record);
      store.set(record.id, record);
      return record;
    },
    async findActiveUsers() {
      return [...store.values()].map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        roles: row.roles,
        status: row.status,
        weekHours: row.weekHours,
        points: row.points,
        completedTasks: row.completedTasks,
        avatar: row.avatar,
        bio: row.bio,
        bannerKey: row.bannerKey,
        cpf: row.cpf,
        registrationNumber: row.registrationNumber,
        course: row.course,
        scholarshipType: row.scholarshipType,
        fundingAgency: row.fundingAgency,
        fundingAgencyOther: row.fundingAgencyOther,
        level: row.level,
      }));
    },
  } as never;

  const hasher = {
    async hash(value: string) {
      return `hashed:${value}`;
    },
  } as never;

  return {
    repository,
    hasher,
    writes,
    rowOf: (id: number) => store.get(id),
  };
}

describe("UpdateUserUseCase (PUT do painel) — escrita dos dados de pessoa", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture();
  });

  it("normaliza a grafia de tela para o token e o CPF para dígitos", async () => {
    const result = await new UpdateUserUseCase(fx.repository).execute(manager, 1, {
      cpf: "529.982.247-25",
      registrationNumber: "  2026110001  ",
      course: "Sistemas de Informação",
      scholarshipType: "PIBIC Jr",
      fundingAgency: "cnpq",
      level: "Pós-graduação",
    });

    expect(result.cpf).toBe("52998224725");
    expect(fx.rowOf(1)?.cpf).toBe("52998224725");
    expect(fx.rowOf(1)?.registrationNumber).toBe("2026110001");
    expect(fx.rowOf(1)?.scholarshipType).toBe("PIBIC_JR");
    expect(fx.rowOf(1)?.fundingAgency).toBe("CNPQ");
    expect(fx.rowOf(1)?.level).toBe("POS_GRADUACAO");
    // Quem acabou de escrever recebe de volta o que escreveu (o gate já deu o direito).
    expect(result.course).toBe("Sistemas de Informação");
  });

  it("recusa CPF inválido e modalidade fora da lista, com a mensagem da regra", async () => {
    await expect(
      new UpdateUserUseCase(fx.repository).execute(manager, 1, { cpf: "529.982.247-26" })
    ).rejects.toThrow("CPF inválido");

    await expect(
      new UpdateUserUseCase(fx.repository).execute(manager, 1, { scholarshipType: "ICV" })
    ).rejects.toThrow("Modalidade de IC inválida");

    await expect(
      new UpdateUserUseCase(fx.repository).execute(manager, 1, { level: "EJA" })
    ).rejects.toThrow("Nível inválido");

    // Nada foi gravado: a recusa acontece antes de qualquer escrita.
    expect(fx.writes).toEqual([]);
  });

  it("a própria pessoa escreve os próprios dados (a trava self-editável os inclui)", async () => {
    const result = await new UpdateUserUseCase(fx.repository).execute(owner, 1, {
      course: "Engenharia de Software",
    });

    expect(result.course).toBe("Engenharia de Software");
    expect(fx.rowOf(1)?.course).toBe("Engenharia de Software");
  });

  it("terceiro sem gestão é negado antes da trava de campos", async () => {
    await expect(
      new UpdateUserUseCase(fx.repository).execute(stranger, 1, {
        course: "Hackeado",
        cpf: "52998224725",
      })
    ).rejects.toThrow(ForbiddenError);

    expect(fx.rowOf(1)?.course).toBeNull();
    expect(fx.rowOf(1)?.cpf).toBeNull();
  });

  it("chave ausente no corpo não apaga dado escrito", async () => {
    await new UpdateUserUseCase(fx.repository).execute(manager, 1, {
      course: "Ciência da Computação",
      scholarshipType: "PIBITI",
    });

    await new UpdateUserUseCase(fx.repository).execute(manager, 1, { name: "Outro nome" });

    expect(fx.rowOf(1)?.course).toBe("Ciência da Computação");
    expect(fx.rowOf(1)?.scholarshipType).toBe("PIBITI");
  });

  it("escolher CNPq apaga o texto livre da agência (o formulário só tem agencia_outra com is_outra)", async () => {
    await new UpdateUserUseCase(fx.repository).execute(manager, 1, {
      fundingAgency: "OUTRA",
      fundingAgencyOther: "FAPEMIG",
    });
    expect(fx.rowOf(1)?.fundingAgencyOther).toBe("FAPEMIG");

    await new UpdateUserUseCase(fx.repository).execute(manager, 1, { fundingAgency: "CNPQ" });
    expect(fx.rowOf(1)?.fundingAgency).toBe("CNPQ");
    expect(fx.rowOf(1)?.fundingAgencyOther).toBeNull();
  });

  it("texto acima do teto é recusado nomeando o campo", async () => {
    await expect(
      new UpdateUserUseCase(fx.repository).execute(manager, 1, { course: "C".repeat(121) })
    ).rejects.toThrow(ValidationError);
    expect(fx.writes).toEqual([]);
  });
});

describe("UpdateUserProfileUseCase (PATCH do perfil) — a mesma regra", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture();
  });

  it("a pessoa escreve os próprios dados e recebe o CPF de volta", async () => {
    const result = await new UpdateUserProfileUseCase(fx.repository, fx.hasher).execute(owner, 1, {
      cpf: "111.444.777-35",
      level: "Graduação",
    });

    expect(result.cpf).toBe("11144477735");
    expect(fx.rowOf(1)?.level).toBe("GRADUACAO");
    expect(result).not.toHaveProperty("password");
  });

  it("terceiro sem gestão leva a negação própria do perfil, e nada é escrito", async () => {
    await expect(
      new UpdateUserProfileUseCase(fx.repository, fx.hasher).execute(stranger, 1, {
        course: "Hackeado",
      })
    ).rejects.toThrow(PROFILE_DENIED_MESSAGE);

    expect(fx.writes).toEqual([]);
  });

  it("CPF inválido no perfil é 400 com a mensagem da regra", async () => {
    await expect(
      new UpdateUserProfileUseCase(fx.repository, fx.hasher).execute(owner, 1, { cpf: "123" })
    ).rejects.toThrow("CPF inválido");
    expect(fx.writes).toEqual([]);
  });
});

describe("leitura de um usuário — o gate já deu o direito ao CPF", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture([
      userRow(1, { cpf: "52998224725", course: "Sistemas de Informação" }),
    ]);
  });

  it("a própria pessoa lê o próprio CPF", async () => {
    const result = await new FindUserByIdUseCase(fx.repository).execute(owner, 1);
    expect(result?.cpf).toBe("52998224725");
    expect(result?.course).toBe("Sistemas de Informação");
  });

  it("a gestão lê o CPF de terceiro", async () => {
    const result = await new FindUserByIdUseCase(fx.repository).execute(manager, 1);
    expect(result?.cpf).toBe("52998224725");
  });

  it("quem gerencia projeto, não contas, não chega aqui: é negado antes da projeção", async () => {
    await expect(
      new FindUserByIdUseCase(fx.repository).execute(projectManager, 1)
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("leitura da lista — tier por tier (DEC-138)", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture([
      userRow(1, {
        cpf: "52998224725",
        registrationNumber: "2026110001",
        course: "Sistemas de Informação",
        scholarshipType: "PIBIC",
        fundingAgency: "CNPQ",
        level: "GRADUACAO",
      }),
      userRow(2, { roles: ["COORDENADOR"] }),
    ]);
  });

  it("voluntário vê os campos abertos e não vê o CPF", async () => {
    const rows = await new ListUsersForActorUseCase(fx.repository).execute({ actor: owner });
    const row = rows.find((r) => r.id === 1)!;

    expect(row.course).toBe("Sistemas de Informação");
    expect(row.registrationNumber).toBe("2026110001");
    expect(row.scholarshipType).toBe("PIBIC");
    expect(row.fundingAgency).toBe("CNPQ");
    expect(row.level).toBe("GRADUACAO");
    expect(row).not.toHaveProperty("cpf");
    // A tier de e-mail também não muda: quem não gerencia não lê e-mail alheio.
    expect(row).not.toHaveProperty("email");
  });

  it("quem gerencia contas vê o CPF na lista, porque é ali que o painel o edita", async () => {
    const rows = await new ListUsersForActorUseCase(fx.repository).execute({ actor: manager });
    const row = rows.find((r) => r.id === 1)!;

    expect(row.cpf).toBe("52998224725");
    expect(row.bio).toBeDefined();
  });

  it("gerente de projeto não vê CPF nem bio, mas vê os campos abertos", async () => {
    const rows = await new ListUsersForActorUseCase(fx.repository).execute({
      actor: projectManager,
    });
    const row = rows.find((r) => r.id === 1)!;

    expect(row).not.toHaveProperty("cpf");
    expect(row).not.toHaveProperty("bio");
    expect(row.course).toBe("Sistemas de Informação");
  });
});
