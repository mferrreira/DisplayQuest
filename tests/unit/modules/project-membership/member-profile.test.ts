/**
 * V5-4b (DEC-149) — o use case que escreve os dados do vínculo, sobre porta falsa em memória.
 *
 * O que este arquivo segura:
 *   1. A autorização é a ACL do PROJETO (`canManageProjectMembers`), não `MANAGE_USERS`: quem
 *      gerencia contas e não participa do projeto não edita vínculo, e quem é `GERENTE_PROJETO`
 *      na membership edita sem ter papel global.
 *   2. O gate vem antes da escrita, e a normalização vem antes do `update`: corpo inválido não
 *      grava metade (é aqui, e não na regra pura, que essa garantia mora).
 *   3. Chave ausente não apaga: o merge parte do que está gravado.
 *   4. O vínculo procurado é escopado no projeto — membership de outro projeto não é alcançada.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";
import { UpdateProjectMemberProfileUseCase } from "@/backend/modules/project-membership/application/use-cases/update-project-member-profile.use-case";
import type { MembershipRecord } from "@/backend/modules/project-membership/application/ports/project-membership.repository";

const PROJECT = 10;
const MANAGER_GLOBAL = { actorUserId: 999, actorRoles: ["COORDENADOR"] as never };
const MANAGER_BY_MEMBERSHIP = { actorUserId: 4, actorRoles: ["VOLUNTARIO"] as never }; // membership[GERENTE_PROJETO]
const OUTSIDER = { actorUserId: 77, actorRoles: ["VOLUNTARIO"] as never }; // sem membership

function membershipRow(overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return {
    id: 5,
    projectId: PROJECT,
    userId: 4,
    roles: ["VOLUNTARIO"],
    joinedAt: new Date("2026-02-01T12:00:00.000Z"),
    userName: "Ana",
    userEmail: "ana@lab.com",
    lattes: null,
    cargaHoraria: null,
    categoria: null,
    situacao: "ATIVO",
    dataEntrada: "2026-02-01",
    ...overrides,
  };
}

function makeFixture(
  rows: MembershipRecord[] = [membershipRow()],
  // A membership do ATOR no projeto (o que `findMembership` devolve). `null` = o ator não
  // participa do projeto. Explícito porque a confusão aqui é o gate ficar verde por acidente.
  actorMembership: { userId: number; roles: string[] } | null = null,
) {
  const store = new Map(rows.map((row) => [row.id, row]));
  const writes: Array<Partial<MembershipRecord> & { id: number }> = [];

  const memberships = {
    async findMembership(projectId: number, userId: number) {
      if (projectId !== PROJECT || !actorMembership || actorMembership.userId !== userId) return null;
      return { id: 99, roles: actorMembership.roles as never };
    },
    // Cópia na leitura: o use case mergeia sobre o record lido.
    async findMembershipById(membershipId: number, projectId: number) {
      const row = store.get(membershipId);
      return row && row.projectId === projectId ? { ...row } : null;
    },
    async updateMembershipProfile(membershipId: number, data: Partial<MembershipRecord>) {
      const current = store.get(membershipId);
      if (!current) throw new Error("membership ausente");
      const next = { ...current, ...data };
      store.set(membershipId, next);
      writes.push({ id: membershipId, ...data });
      return next;
    },
  } as never;

  return {
    memberships,
    writes,
    rowOf: (id: number) => store.get(id),
  };
}

const actorFor = (actor: { actorUserId: number; actorRoles: never }) => ({
  projectId: PROJECT,
  actorUserId: actor.actorUserId,
  actorRoles: actor.actorRoles,
});

describe("UpdateProjectMemberProfileUseCase — autorização", () => {
  it("quem só gerencia contas, sem participação no projeto, é barrado com a mensagem do módulo", async () => {
    const fx = makeFixture();

    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(OUTSIDER),
        membershipId: 5,
        data: { cargaHoraria: 20 },
      }),
    ).rejects.toThrow("Apenas coordenadores, gerentes ou gerente do projeto podem atualizar dados do membro");

    expect(fx.writes).toEqual([]);
  });

  it("papel global de projeto gerencia sem membership", async () => {
    const fx = makeFixture();

    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_GLOBAL),
      membershipId: 5,
      data: { cargaHoraria: 20 },
    });

    expect(result.cargaHoraria).toBe(20);
  });

  it("GERENTE_PROJETO na membership gerencia sem papel global (quirk congelado da ACL)", async () => {
    const fx = makeFixture([membershipRow()], { userId: 4, roles: ["GERENTE_PROJETO"] });

    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_BY_MEMBERSHIP),
      membershipId: 5,
      data: { categoria: "Bolsista" },
    });

    expect(result.categoria).toBe("BOLSISTA");
  });

  it("voluntário do projeto não gerencia vínculo", async () => {
    const fx = makeFixture([membershipRow()], { userId: 4, roles: ["VOLUNTARIO"] });

    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_BY_MEMBERSHIP),
        membershipId: 5,
        data: { categoria: "BOLSISTA" },
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("UpdateProjectMemberProfileUseCase — o vínculo é procurado escopado no projeto", () => {
  it("membership de outro projeto não é alcançada por esta rota", async () => {
    const fx = makeFixture([membershipRow({ id: 6, projectId: 11 })]);

    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 6,
        data: { cargaHoraria: 20 },
      }),
    ).rejects.toThrow(NotFoundError);

    expect(fx.writes).toEqual([]);
  });

  it("membership inexistente: 404 com a mensagem do módulo", async () => {
    const fx = makeFixture();

    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 404,
        data: { cargaHoraria: 20 },
      }),
    ).rejects.toThrow("Membro não encontrado no projeto");
  });
});

describe("UpdateProjectMemberProfileUseCase — normalização e merge", () => {
  let fx: ReturnType<typeof makeFixture>;

  beforeEach(() => {
    fx = makeFixture([
      membershipRow({
        lattes: "9999999999999999",
        cargaHoraria: 8,
        categoria: "VOLUNTARIO",
        situacao: "ATIVO",
        dataEntrada: "2026-02-01",
      }),
    ]);
  });

  it("normaliza os cinco campos na escrita", async () => {
    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_GLOBAL),
      membershipId: 5,
      data: {
        lattes: "  1234567890123456  ",
        cargaHoraria: "20",
        categoria: "Bolsista",
        situacao: "Inativo",
        dataEntrada: "2026-10-14T02:00:00.000Z", // ainda 13/10 no laboratório (DEC-132)
      },
    });

    expect(result.lattes).toBe("1234567890123456");
    expect(result.cargaHoraria).toBe(20);
    expect(result.categoria).toBe("BOLSISTA");
    expect(result.situacao).toBe("INATIVO");
    expect(result.dataEntrada).toBe("2026-10-13");
    expect(fx.rowOf(5)?.dataEntrada).toBe("2026-10-13");
  });

  it("corpo parcial mantém o que não foi tocado", async () => {
    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_GLOBAL),
      membershipId: 5,
      data: { cargaHoraria: 20 },
    });

    expect(result.cargaHoraria).toBe(20);
    expect(result.lattes).toBe("9999999999999999");
    expect(result.categoria).toBe("VOLUNTARIO");
    expect(result.situacao).toBe("ATIVO");
    expect(result.dataEntrada).toBe("2026-02-01");
  });

  it("string vazia limpa, e situação continua ATIVO (a coluna não tem estado sem valor)", async () => {
    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_GLOBAL),
      membershipId: 5,
      data: { cargaHoraria: "", categoria: "", lattes: "" },
    });

    expect(result.cargaHoraria).toBeNull();
    expect(result.categoria).toBeNull();
    expect(result.lattes).toBeNull();
    expect(result.situacao).toBe("ATIVO");
  });

  it("corpo inválido não grava metade: a garantia está no use case, não na regra pura", async () => {
    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 5,
        data: { cargaHoraria: 40, categoria: "MEMBRO" },
      }),
    ).rejects.toThrow(ValidationError);

    expect(fx.writes).toEqual([]);
    expect(fx.rowOf(5)?.cargaHoraria).toBe(8);
    expect(fx.rowOf(5)?.categoria).toBe("VOLUNTARIO");
  });

  it("carga absurda é recusada antes de virar número no atestado", async () => {
    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 5,
        data: { cargaHoraria: 500 },
      }),
    ).rejects.toThrow("Carga horária do membro deve ser um número maior que 0 e no máximo 168 horas semanais");

    expect(fx.rowOf(5)?.cargaHoraria).toBe(8);
  });

  it("data sem leitura é recusada nomeando o campo — `01/02/2026` não é 2 de janeiro", async () => {
    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 5,
        data: { dataEntrada: "01/02/2026" },
      }),
    ).rejects.toThrow("Data de entrada do membro é inválida (use AAAA-MM-DD)");

    expect(fx.rowOf(5)?.dataEntrada).toBe("2026-02-01");
  });

  it("o que volta é o record do adapter, junto com id, papéis e joinedAt", async () => {
    const result = await new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
      ...actorFor(MANAGER_GLOBAL),
      membershipId: 5,
      data: { situacao: "INATIVO" },
    });

    expect(result).toMatchObject({
      id: 5,
      userId: 4,
      userName: "Ana",
      userEmail: "ana@lab.com",
      roles: ["VOLUNTARIO"],
      situacao: "INATIVO",
    });
    expect(result.joinedAt).toBe("2026-02-01T12:00:00.000Z");
    expect(result).not.toHaveProperty("password");
  });
});

describe("colisões de vocabulário que este batch não introduz (DEC-96)", () => {
  it("`categoria` não aceita papel de `roles`: são duas perguntas diferentes", async () => {
    const fx = makeFixture();

    await expect(
      new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
        ...actorFor(MANAGER_GLOBAL),
        membershipId: 5,
        data: { categoria: "COORDENADOR" },
      }),
    ).rejects.toThrow(ValidationError);

    // O papel continua sendo escrito pelo caminho dele (`set_roles`), e a categoria não é atalho.
    expect(fx.rowOf(5)?.categoria).toBeNull();
  });

  it("`situacao` não aceita o vocabulário de usuário (`inactive`/`suspended`)", async () => {
    const fx = makeFixture();

    for (const value of ["inactive", "suspended", "on_leave"]) {
      await expect(
        new UpdateProjectMemberProfileUseCase({ memberships: fx.memberships }).execute({
          ...actorFor(MANAGER_GLOBAL),
          membershipId: 5,
          data: { situacao: value },
        }),
      ).rejects.toThrow(ValidationError);
    }
  });
});
