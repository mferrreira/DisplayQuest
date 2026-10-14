// @vitest-environment node
/**
 * V5-4b (DEC-149) — o contrato HTTP de `PATCH /api/projects/[id]/members` com `action:
 * "set_profile"`, com o MÓDULO REAL sobre portas falsas (lição do B6-2a: um duplo que devolve
 * o módulo inteiro faz a negação SUMIR do teste em vez de falhar). Só sessão e banco são
 * dobrados; gate, normalização e projeção são os de produção — inclusive a normalização de
 * papéis de `requireApiActor`, que é o que faz `roles: "COORDENADOR"` negar todo mundo.
 *
 * O que este arquivo congela na borda:
 *   1. Os cinco campos do vínculo saem na LISTA (é a tela que os mostra), inclusive para quem
 *      não gerencia — leitura aberta do projeto (DEC-136/127).
 *   2. A escrita é a ACL do projeto: quem não gerencia leva a mensagem do módulo, e o 403 vem
 *      ANTES do 400 do corpo inválido (o par medido do B6-2b — autorização não depende do
 *      corpo ser válido).
 *   3. Valor fora da lista sai em 400 com a mensagem da regra, e nada é gravado.
 *   4. O vínculo é procurado escopado no projeto: membership de outro projeto é 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { emptyMemberProfile } from "@/backend/domain";
import { createProjectMembershipModule } from "@/backend/modules/project-membership";
import type { MembershipRecord } from "@/backend/modules/project-membership/application/ports/project-membership.repository";

type Session = { id: number; email: string; name: string; roles: string[]; status: string };

const PROJECT = 10;

const mocks = vi.hoisted(() => ({
  session: null as null | Session,
  memberships: new Map<number, MembershipRecord>(),
  actorMembershipRoles: null as string[] | null,
  writes: [] as Array<{ id: number; data: Partial<MembershipRecord> }>,
}));

function membershipRow(id: number, overrides: Partial<MembershipRecord> = {}): MembershipRecord {
  return {
    id,
    projectId: PROJECT,
    userId: 4,
    roles: ["VOLUNTARIO"],
    joinedAt: new Date("2026-02-01T12:00:00.000Z"),
    userName: "Ana",
    userEmail: "ana@lab.com",
    ...emptyMemberProfile(),
    dataEntrada: "2026-02-01",
    ...overrides,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const memberships = {
    async findMembership(projectId: number, userId: number) {
      if (projectId !== PROJECT || !mocks.actorMembershipRoles) return null;
      // O ator do caso é sempre o usuário 4 quando existe membership no projeto.
      if (userId !== 4) return null;
      return { id: 99, roles: mocks.actorMembershipRoles as never };
    },
    // Cópia na leitura (medido no V5-3 e no V5-4a): sem isso a falha do update parece sucesso.
    async findMembershipById(membershipId: number, projectId: number) {
      const row = mocks.memberships.get(membershipId);
      return row && row.projectId === projectId ? { ...row } : null;
    },
    async listMembersWithUser(projectId: number) {
      return [...mocks.memberships.values()]
        .filter((row) => row.projectId === projectId)
        .map((row) => ({ ...row }));
    },
    async updateMembershipProfile(membershipId: number, data: Partial<MembershipRecord>) {
      const current = mocks.memberships.get(membershipId);
      if (!current) throw new Error("membership ausente");
      const next = { ...current, ...data };
      mocks.memberships.set(membershipId, next);
      mocks.writes.push({ id: membershipId, data });
      return next;
    },
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    deleteMembership: notUsed("memberships.deleteMembership"),
    countMembersWithRole: notUsed("memberships.countMembersWithRole"),
  };

  const hours = {
    async sumCompletedSecondsByUser() {
      return [{ userId: 4, seconds: 7200 }];
    },
  };

  const access = {
    projectExists: notUsed("access.projectExists"),
    userExists: notUsed("access.userExists"),
    leadsAnotherProject: notUsed("access.leadsAnotherProject"),
    setProjectLeader: notUsed("access.setProjectLeader"),
  };

  return {
    getBackendComposition: () => ({
      projectMembership: createProjectMembershipModule({ ports: { memberships, hours, access } }),
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

import {
  GET as listMembers,
  PATCH as patchMembers,
  POST as postMembers,
} from "@/app/api/projects/[id]/members/route";

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const volunteer = { id: 4, email: "ana@lab.com", name: "Ana", roles: ["VOLUNTARIO"], status: "active" };
const coordinator = { id: 9, email: "coord@lab.com", name: "Coordenador", roles: ["COORDENADOR"], status: "active" };

function patch(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3001/api/projects/${PROJECT}/members`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.session = coordinator;
  mocks.writes = [];
  mocks.actorMembershipRoles = null;
  mocks.memberships = new Map([
    [5, membershipRow(5, { cargaHoraria: 8, categoria: "VOLUNTARIO", lattes: "9999999999999999" })],
    [6, membershipRow(6, { projectId: 11, userId: 8, userName: "Beto" })],
  ]);
});

describe("GET /api/projects/[id]/members — os dados do vínculo chegam na lista", () => {
  it("a lista carrega os cinco campos, para quem não gerencia também (leitura aberta)", async () => {
    mocks.session = volunteer;

    const response = await listMembers(new Request("http://localhost:3001/api/projects/10/members"), params({ id: "10" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({
      id: 5,
      userId: 4,
      lattes: "9999999999999999",
      cargaHoraria: 8,
      categoria: "VOLUNTARIO",
      situacao: "ATIVO",
      dataEntrada: "2026-02-01",
      totalHours: 2,
    });
  });

  it("projeto com id que não é id -> 400 da rota", async () => {
    const response = await listMembers(new Request("http://localhost:3001/api/projects/abc/members"), params({ id: "abc" }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Projeto inválido");
  });
});

describe("PATCH action=set_profile — escrever o vínculo", () => {
  it("normaliza no caminho HTTP e devolve o vínculo escrito", async () => {
    const response = await patchMembers(
      patch({
        action: "set_profile",
        membershipId: 5,
        lattes: "  1234567890123456  ",
        cargaHoraria: "20",
        categoria: "Bolsista",
        situacao: "Inativo",
        dataEntrada: "2026-10-14T02:00:00.000Z",
      }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.membership).toMatchObject({
      id: 5,
      lattes: "1234567890123456",
      cargaHoraria: 20,
      categoria: "BOLSISTA",
      situacao: "INATIVO",
      dataEntrada: "2026-10-13",
    });
    expect(body.membership).not.toHaveProperty("password");
  });

  it("corpo parcial não apaga o que não foi tocado", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, cargaHoraria: 20 }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.membership.cargaHoraria).toBe(20);
    expect(body.membership.categoria).toBe("VOLUNTARIO");
    expect(body.membership.lattes).toBe("9999999999999999");
    expect(body.membership.dataEntrada).toBe("2026-02-01");
  });

  it("string vazia limpa a carga declarada", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, cargaHoraria: "", categoria: "" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.membership.cargaHoraria).toBeNull();
    expect(body.membership.categoria).toBeNull();
    // situação continua ATIVO: a coluna não tem estado sem valor (DEC-149).
    expect(body.membership.situacao).toBe("ATIVO");
  });

  it("membershipId ausente ou não-inteiro -> 400 da rota, antes de qualquer use case", async () => {
    for (const body of [
      { action: "set_profile", cargaHoraria: 20 },
      { action: "set_profile", membershipId: 0, cargaHoraria: 20 },
      { action: "set_profile", membershipId: "abc", cargaHoraria: 20 },
    ]) {
      const response = await patchMembers(patch(body), params({ id: "10" }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("membershipId é obrigatório");
    }

    expect(mocks.writes).toEqual([]);
  });

  it("ação que não está na lista -> 400 (PATCH é estrito)", async () => {
    const response = await patchMembers(
      patch({ action: "set_carga", membershipId: 5, cargaHoraria: 20 }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Ação inválida");
  });

  it("POST legado com a ação explícita também aceita `set_profile` (medido, não é recusa)", async () => {
    // `resolveAction` confia numa ação explícita nos dois verbos: `strictAction` só muda o que
    // acontece quando a ação está AUSENTE (POST deduz remove/add do corpo; PATCH recusa).
    // Congelado aqui para ninguém "corrigir" isso depois achando que o POST é só legado.
    const response = await postMembers(
      new NextRequest(`http://localhost:3001/api/projects/${PROJECT}/members`, {
        method: "POST",
        body: JSON.stringify({ action: "set_profile", membershipId: 5, cargaHoraria: 20 }),
      }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).membership.cargaHoraria).toBe(20);
  });
});

describe("PATCH action=set_profile — recusa", () => {
  it("categoria fora da lista -> 400 com a mensagem da regra, e nada é gravado", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, categoria: "MEMBRO" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Categoria de membro inválida");
    expect(mocks.writes).toEqual([]);
    expect(mocks.memberships.get(5)?.categoria).toBe("VOLUNTARIO");
  });

  it("carga absurda -> 400 com a mensagem da regra", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, cargaHoraria: 500 }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Carga horária do membro deve ser um número maior que 0 e no máximo 168 horas semanais",
    );
  });

  it("data no formato dos EUA -> 400 nomeando o campo, em vez de virar 2 de janeiro", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, dataEntrada: "01/02/2026" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Data de entrada do membro é inválida (use AAAA-MM-DD)");
    expect(mocks.memberships.get(5)?.dataEntrada).toBe("2026-02-01");
  });

  it("vínculo de outro projeto não é alcançado por esta rota -> 404", async () => {
    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 6, cargaHoraria: 20 }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Membro não encontrado no projeto");
    expect(mocks.writes).toEqual([]);
  });

  it("sem sessão -> 401", async () => {
    mocks.session = null;

    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, cargaHoraria: 20 }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(401);
  });
});

describe("PATCH action=set_profile — o par 403-antes-do-400 (medido no B6-2b, congelado aqui)", () => {
  it("quem não gerencia o projeto leva a mensagem do módulo, mesmo com corpo inválido", async () => {
    mocks.session = volunteer;
    mocks.actorMembershipRoles = ["VOLUNTARIO"];

    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, categoria: "MEMBRO", cargaHoraria: 500 }),
      params({ id: "10" }),
    );

    // Não é 400: a autorização não depende do corpo ser válido.
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe(
      "Apenas coordenadores, gerentes ou gerente do projeto podem atualizar dados do membro",
    );
    expect(mocks.writes).toEqual([]);
  });

  it("GERENTE_PROJETO na membership escreve sem papel global", async () => {
    mocks.session = volunteer;
    mocks.actorMembershipRoles = ["GERENTE_PROJETO"];

    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, situacao: "INATIVO" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).membership.situacao).toBe("INATIVO");
  });

  it("papel global de projeto escreve sem membership (ACL congelada)", async () => {
    mocks.actorMembershipRoles = null;

    const response = await patchMembers(
      patch({ action: "set_profile", membershipId: 5, categoria: "BOLSISTA" }),
      params({ id: "10" }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).membership.categoria).toBe("BOLSISTA");
  });
});
