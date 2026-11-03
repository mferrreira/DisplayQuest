// @vitest-environment node
/**
 * S06 (plan-v12, DEC-239) — rota de parâmetros do recorte da capa do projeto.
 *
 * Mesma postura do arquivo do perfil: módulo REAL sobre portas falsas (lição do B6-2a). Congela:
 *   1. 401 → 400 (id/slot) → 403 → 400 (corpo), com o gate de gestão do projeto ANTES do corpo.
 *   2. Entrada estrita: centro fora de [0,1] ou zoom < 1 é 400, não clamp.
 *   3. Zoom acima do máximo e centro fora da janela do zoom entram no intervalo pelo clamp.
 *   4. Gate = ACL do vínculo (membership `[VOLUNTARIO]` não gerencia, mesmo com papel global),
 *      e o parâmetro entra na coluna do projeto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createProjectManagementModule } from "@/backend/modules/project-management";
import type { ProjectRecord } from "@/backend/modules/project-management/application/ports/project.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  memberships: new Map<string, string[] | null>(),
  actors: new Map<number, string[]>(),
}));

function projectRow(id: number): ProjectRecord {
  return {
    id,
    name: `Projeto ${id}`,
    description: null,
    createdAt: "2026-10-01",
    createdBy: 1,
    leaderId: 1,
    status: "active",
    links: null,
    startDate: null,
    endDate: null,
    editalNumber: null,
    processNumber: null,
    proppiNumber: null,
    points: 0,
    logoKey: null,
    bannerKey: "projects/2/images/banner/x.webp",
    bannerCropX: null,
    bannerCropY: null,
    bannerCropZoom: null,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const projects = {
    async findById(id: number) {
      const row = mocks.projects.get(id);
      return row ? { ...row } : null;
    },
    async update(record: ProjectRecord) {
      mocks.projects.set(record.id as number, record);
      return record;
    },
    findAll: notUsed("projects.findAll"),
    create: notUsed("projects.create"),
    incrementPoints: notUsed("projects.incrementPoints"),
    delete: notUsed("projects.delete"),
  };
  const memberships = {
    async findMembership(projectId: number, userId: number) {
      const roles = mocks.memberships.get(`${projectId}:${userId}`);
      return roles === null || roles === undefined ? null : { userId, roles };
    },
    findForProject: notUsed("memberships.findForProject"),
    findForUser: notUsed("memberships.findForUser"),
    add: notUsed("memberships.add"),
    remove: notUsed("memberships.remove"),
    setRoles: notUsed("memberships.setRoles"),
    countByProject: notUsed("memberships.countByProject"),
  };
  const actors = {
    async findActor(actorId: number) {
      const roles = mocks.actors.get(actorId);
      return roles ? { id: actorId, roles } : null;
    },
    getNames: notUsed("actors.getNames"),
  };

  return {
    getBackendComposition: () => ({
      projectManagement: createProjectManagementModule({ ports: { projects, memberships, actors } as never }),
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

import { PUT } from "@/app/api/projects/[id]/images/[slot]/crop/route";

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function cropRequest(body: unknown, projectId = 2, slot = "banner") {
  return new NextRequest(new URL(`/api/projects/${projectId}/images/${slot}/crop`, "http://localhost:3000"), {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.projects.clear();
  mocks.memberships.clear();
  mocks.actors.clear();
  mocks.projects.set(2, projectRow(2));
  // Sem membership, o ator é consultado pelo adaptador de atores — o fake devolve o papel global.
  mocks.actors.set(1, ["COORDENADOR"]);
  mocks.actors.set(5, ["VOLUNTARIO"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/projects/<id>/images/banner/crop", () => {
  it("sem sessão responde 401 antes de qualquer checagem", async () => {
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 1 }), context({ id: "2", slot: "banner" }));
    expect(response.status).toBe(401);
  });

  it("id não-numérico e slot fora da lista fechada respondem 400 com a mensagem da casa", async () => {
    login(["COORDENADOR"], 1);
    const bad = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 1 }, 0), context({ id: "abc", slot: "banner" }));
    expect(bad.status).toBe(400);
    expect((await read(bad)).error).toBe("Projeto inválido");

    const slot = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 1 }, 2, "logo"), context({ id: "2", slot: "avatar" }));
    expect(slot.status).toBe(400);
    expect((await read(slot)).error).toMatch(/logo/);
  });

  it("o gate de gestão roda antes do corpo: sem gestão com corpo inválido chega 403, não 400", async () => {
    // Membership existe: os papéis do vínculo decidem. [VOLUNTARIO] não gerencia.
    mocks.memberships.set("2:9", ["VOLUNTARIO"]);
    login(["COORDENADOR"], 9);
    const response = await PUT(cropRequest({ x: 5, y: 0.5, zoom: 1 }), context({ id: "2", slot: "banner" }));
    expect(response.status).toBe(403);
    expect((await read(response)).error).toMatch(/gerenciar/i);
  });

  it("projeto inexistente responde 404 para quem gerencia", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 1 }, 77), context({ id: "77", slot: "banner" }));
    expect(response.status).toBe(404);
    expect((await read(response)).error).toMatch(/não encontrado/i);
  });

  it("entrada estrita: centro fora de [0,1] e zoom < 1 são recusados (400), não clampados", async () => {
    login(["COORDENADOR"], 1);
    for (const body of [{ x: 1.5, y: 0.5, zoom: 1 }, { x: 0.5, y: -0.1, zoom: 1 }, { x: 0.5, y: 0.5, zoom: 0.9 }, { x: "0.5", y: 0.5, zoom: 1 }, {}]) {
      const response = await PUT(cropRequest(body), context({ id: "2", slot: "banner" }));
      expect(response.status).toBe(400);
      expect((await read(response)).error).toBe("Recorte inválido");
    }
    expect(mocks.projects.get(2)!.bannerCropZoom).toBeNull();
  });

  it("zoom no máximo e centro na janela do zoom: o clamp entra na coluna, a resposta traz o gravado", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT(cropRequest({ x: 0.9, y: 0.5, zoom: 5 }), context({ id: "2", slot: "banner" }));
    expect(response.status).toBe(200);
    const project = (await read(response)).project;
    expect(project.bannerCropZoom).toBe(4);
    // Para zoom 4 o centro permitido é [1/8, 7/8]: 0.9 cai em 7/8.
    expect(project.bannerCropX).toBe(1 - 1 / 8);
    expect(project.bannerCropY).toBe(0.5);
    expect(mocks.projects.get(2)!.bannerCropX).toBe(1 - 1 / 8);
    expect(mocks.projects.get(2)!.bannerCropZoom).toBe(4);
  });

  it("quem gerencia pela ACL do vínculo (GERENTE_PROJETO) grava o parâmetro", async () => {
    mocks.memberships.set("2:5", ["GERENTE_PROJETO"]);
    login(["VOLUNTARIO"], 5);
    const response = await PUT(cropRequest({ x: 0.25, y: 0.5, zoom: 2 }), context({ id: "2", slot: "banner" }));
    expect(response.status).toBe(200);
    const project = (await read(response)).project;
    expect(project.bannerCropX).toBe(0.25);
    expect(project.bannerCropZoom).toBe(2);
    expect(project.bannerKey).toBe("projects/2/images/banner/x.webp");
    // O binário não se move: a chave da capa segue a mesma (DEC-239).
    expect(mocks.projects.get(2)!.bannerKey).toBe("projects/2/images/banner/x.webp");
  });

  it("sem membership, a gestão global decide: COORDENADOR sem vínculo grava", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 1 }), context({ id: "2", slot: "banner" }));
    expect(response.status).toBe(200);
    expect(mocks.projects.get(2)!.bannerCropZoom).toBe(1);
  });
});
