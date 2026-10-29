// @vitest-environment node
/**
 * V5-4a (DEC-138) — o contrato HTTP dos dados de pessoa, com o MÓDULO REAL sobre porta falsa
 * (lição do B6-2a: um duplo que devolve o módulo inteiro faz a negação sumir do teste em vez de
 * falhar). Só a sessão e o banco são dobrados; validação, normalização e projeção são as de
 * produção.
 *
 * O que este arquivo congela na borda:
 *   1. O CPF sai na leitura de UM usuário (self OU gestão) e NÃO sai na lista para quem não
 *      gerencia contas — a restrição de leitura é visível no corpo da resposta, não só no use case.
 *   2. Os demais campos de pessoa seguem a leitura aberta: aparecem na lista para um voluntário.
 *   3. Valor fora da lista ou CPF com dígito verificador errado sai em 400 com a mensagem da
 *      regra, e nenhum registro é gravado.
 *   4. A escrita é self OU gestão; terceiro sem gestão leva a mensagem própria do perfil.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { emptyPersonData } from "@/backend/domain";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

type Session = { id: number; email: string; name: string; roles: string[]; status: string };

const mocks = vi.hoisted(() => ({
  session: null as null | Session,
  users: new Map<number, UserRecord>(),
  writes: [] as UserRecord[],
}));

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

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const repository = {
    // Cópia na leitura: o use case muta o record antes de gravar.
    async findById(id: number) {
      const row = mocks.users.get(id);
      return row ? { ...row } : null;
    },
    async update(record: UserRecord) {
      mocks.writes.push(record);
      mocks.users.set(record.id, record);
      return record;
    },
    async findByEmail(email: string) {
      return [...mocks.users.values()].find((row) => row.email === String(email).toLowerCase()) ?? null;
    },
    async findActiveUsers() {
      return [...mocks.users.values()].map((row) => ({
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
        profileVisibility: row.profileVisibility,
        cpf: row.cpf,
        registrationNumber: row.registrationNumber,
        course: row.course,
        scholarshipType: row.scholarshipType,
        fundingAgency: row.fundingAgency,
        fundingAgencyOther: row.fundingAgencyOther,
        level: row.level,
      }));
    },
    create: notUsed("users.create"),
    delete: notUsed("users.delete"),
    findPending: notUsed("users.findPending"),
    findTopByPoints: notUsed("users.findTopByPoints"),
    findTopByTasks: notUsed("users.findTopByTasks"),
    findAll: notUsed("users.findAll"),
  };

  return {
    getBackendComposition: () => ({
      userManagement: createUserManagementModule({ repository: repository as never }),
    }),
  };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? {
          user: null,
          error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }),
        }
      : { user: mocks.session },
}));

import { GET as usersList } from "@/app/api/users/route";
import { GET as userGet, PUT as userPut } from "@/app/api/users/[id]/route";
import { GET as profileGet, PATCH as profilePatch } from "@/app/api/users/[id]/profile/route";

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const owner = { id: 1, email: "pessoa1@lab.com", name: "Pessoa 1", roles: ["VOLUNTARIO"], status: "active" };
const manager = { id: 9, email: "coord@lab.com", name: "Coordenador", roles: ["COORDENADOR"], status: "active" };
const stranger = { id: 99, email: "pessoa99@lab.com", name: "Pessoa 99", roles: ["VOLUNTARIO"], status: "active" };

beforeEach(() => {
  mocks.session = owner;
  mocks.writes = [];
  mocks.users = new Map([
    [1, userRow(1, { cpf: "52998224725", course: "Sistemas de Informação" })],
    [2, userRow(2, { roles: ["COORDENADOR"] })],
  ]);
});

describe("PATCH /api/users/[id]/profile — a pessoa escreve os próprios dados", () => {
  it("normaliza no caminho HTTP: grafia de tela vira token, CPF mascarado vira dígito", async () => {
    const response = await profilePatch(
      new NextRequest("http://localhost:3001/api/users/1/profile", {
        method: "PATCH",
        body: JSON.stringify({
          cpf: "529.982.247-25",
          scholarshipType: "PIBIC Jr",
          level: "Pós-graduação",
          registrationNumber: "2026110001",
        }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.cpf).toBe("52998224725");
    expect(body.user.scholarshipType).toBe("PIBIC_JR");
    expect(body.user.level).toBe("POS_GRADUACAO");
    expect(body.user.registrationNumber).toBe("2026110001");
    expect(body.user).not.toHaveProperty("password");
  });

  it("CPF com dígito verificador errado -> 400 com a mensagem da regra, e nada é gravado", async () => {
    const response = await profilePatch(
      new NextRequest("http://localhost:3001/api/users/1/profile", {
        method: "PATCH",
        body: JSON.stringify({ cpf: "529.982.247-26" }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("CPF inválido");
    expect(mocks.writes).toEqual([]);
  });

  it("modalidade fora da lista fechada -> 400 nomeando o problema", async () => {
    const response = await profilePatch(
      new NextRequest("http://localhost:3001/api/users/1/profile", {
        method: "PATCH",
        body: JSON.stringify({ scholarshipType: "ICV" }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Modalidade de IC inválida");
  });

  it("terceiro sem gestão -> 403 com a mensagem própria do perfil", async () => {
    mocks.session = stranger;

    const response = await profilePatch(
      new NextRequest("http://localhost:3001/api/users/1/profile", {
        method: "PATCH",
        body: JSON.stringify({ course: "Hackeado" }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Não autorizado");
    expect(mocks.users.get(1)?.course).toBe("Sistemas de Informação");
  });
});

describe("leitura: onde o CPF aparece e onde não aparece", () => {
  it("GET /api/users/[id]/profile (self) traz o CPF", async () => {
    const response = await profileGet(
      new NextRequest("http://localhost:3001/api/users/1/profile"),
      params({ id: "1" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.cpf).toBe("52998224725");
    expect(body.user.course).toBe("Sistemas de Informação");
  });

  it("GET /api/users/[id] (gestão lendo terceiro) traz o CPF", async () => {
    mocks.session = manager;

    const response = await userGet(new NextRequest("http://localhost:3001/api/users/1"), params({ id: "1" }));

    expect(response.status).toBe(200);
    expect((await response.json()).user.cpf).toBe("52998224725");
  });

  it("GET /api/users/[id]/profile (terceiro, perfil PÚBLICO): 200 SEM CPF (V5-12, DEC-143/138)", async () => {
    mocks.session = stranger;

    const response = await profileGet(
      new NextRequest("http://localhost:3001/api/users/1/profile"),
      params({ id: "1" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.course).toBe("Sistemas de Informação");
    expect(body.user).not.toHaveProperty("cpf");
  });

  it("GET /api/users/[id]/profile (terceiro, perfil PRIVADO): 403 'Não autorizado'", async () => {
    mocks.session = stranger;
    mocks.users.set(3, userRow(3, { profileVisibility: "private" }));

    const response = await profileGet(
      new NextRequest("http://localhost:3001/api/users/3/profile"),
      params({ id: "3" })
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("Não autorizado");
  });

  it("GET /api/users (voluntário): campos abertos sim, CPF não", async () => {
    const response = await usersList();

    expect(response.status).toBe(200);
    const body = await response.json();
    const row = body.users.find((u: any) => u.id === 1);

    expect(row.course).toBe("Sistemas de Informação");
    expect(row).not.toHaveProperty("cpf");
    expect(row).not.toHaveProperty("email");
  });

  it("GET /api/users (gestão): o CPF chega, porque é na lista que o painel o edita", async () => {
    mocks.session = manager;

    const response = await usersList();
    const body = await response.json();
    const row = body.users.find((u: any) => u.id === 1);

    expect(row.cpf).toBe("52998224725");
  });
});

describe("PUT /api/users/[id] — a escrita da gestão", () => {
  it("escreve os dados de pessoa de terceiro", async () => {
    mocks.session = manager;

    const response = await userPut(
      new NextRequest("http://localhost:3001/api/users/1", {
        method: "PUT",
        body: JSON.stringify({
          fundingAgency: "OUTRA",
          fundingAgencyOther: "FAPEMIG",
          course: "Engenharia",
        }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.fundingAgency).toBe("OUTRA");
    expect(body.user.fundingAgencyOther).toBe("FAPEMIG");
    expect(mocks.users.get(1)?.course).toBe("Engenharia");
  });

  it("trocar para CNPq apaga o texto livre da agência", async () => {
    mocks.session = manager;

    const response = await userPut(
      new NextRequest("http://localhost:3001/api/users/1", {
        method: "PUT",
        body: JSON.stringify({ fundingAgency: "CNPQ" }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(200);
    expect(mocks.users.get(1)?.fundingAgencyOther).toBeNull();
  });

  it("nível inválido -> 400 'Nível inválido' antes de gravar", async () => {
    mocks.session = manager;

    const response = await userPut(
      new NextRequest("http://localhost:3001/api/users/1", {
        method: "PUT",
        body: JSON.stringify({ level: "EJA" }),
      }),
      params({ id: "1" })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Nível inválido");
    expect(mocks.writes).toEqual([]);
  });
});
