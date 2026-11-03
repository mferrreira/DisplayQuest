// @vitest-environment node
/**
 * S05 (plan-v12, DEC-239) — rota de parâmetros do recorte da capa do perfil.
 *
 * Mesma postura dos arquivos de rota do V5-3: módulo REAL sobre porta falsa (lição do B6-2a).
 * Congela:
 *   1. 401 → 400 (id/slot) → 403 → 400 (corpo) → 404 → 200, com o gate ANTES do corpo lido.
 *   2. Entrada estrita: centro fora de [0,1] ou zoom < 1 é 400, não clamp.
 *   3. Zoom acima do máximo e centro fora da janela do zoom entram no intervalo pelo clamp.
 *   4. A escrita é `self OU MANAGE_USERS` com a frase do perfil, e o parâmetro entra na coluna.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { emptyPersonData } from "@/backend/domain";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  users: new Map<number, UserRecord>(),
}));

function userRow(id: number): UserRecord {
  return {
    id,
    name: `Pessoa ${id}`,
    email: `pessoa${id}@lab.com`,
    points: 0,
    completedTasks: 0,
    password: "hashed",
    status: "active",
    weekHours: 0,
    currentWeekHours: 0,
    profileVisibility: "public",
    bio: null,
    avatar: null,
    bannerKey: "users/7/images/banner/x.webp",
    bannerCropX: null,
    bannerCropY: null,
    bannerCropZoom: null,
    ...emptyPersonData(),
    roles: ["VOLUNTARIO"],
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const repository = {
    async findById(id: number) {
      const row = mocks.users.get(id);
      return row ? { ...row } : null;
    },
    async update(record: UserRecord) {
      mocks.users.set(record.id, record);
      return record;
    },
    findByEmail: notUsed("users.findByEmail"),
    create: notUsed("users.create"),
    delete: notUsed("users.delete"),
    findPending: notUsed("users.findPending"),
    findActiveUsers: notUsed("users.findActiveUsers"),
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

import { PUT } from "@/app/api/users/[id]/images/[slot]/crop/route";

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function cropRequest(body: unknown, userId = 7, slot = "banner") {
  return new NextRequest(new URL(`/api/users/${userId}/images/${slot}/crop`, "http://localhost:3000"), {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.users = new Map<number, UserRecord>([
    [7, userRow(7)],
    [9, userRow(9)],
  ]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recorte da capa — ordem de recusa", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 2 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(401);
    expect(mocks.users.get(7)?.bannerCropX).toBeNull();
  });

  it("id que não é número: 400 de rota, antes do gate", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 2 }), context({ id: "abc", slot: "banner" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Usuário inválido" });
  });

  it("slot fora da lista fechada: 400 com a mensagem do domínio", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 2 }), context({ id: "7", slot: "avatar" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Slot de imagem deve ser banner" });
  });

  it("recorte de OUTRA pessoa por quem não gerencia: 403 'Não autorizado' e coluna intacta", async () => {
    login(["VOLUNTARIO"], 9);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 2 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(403);
    expect(await read(response)).toMatchObject({ error: "Não autorizado" });
    expect(mocks.users.get(7)?.bannerCropX).toBeNull();
  });

  it("corpo inválido: centro fora de [0,1] é 400, não clamp", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 2, y: 0.5, zoom: 2 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Recorte inválido" });
    expect(mocks.users.get(7)?.bannerCropX).toBeNull();
  });

  it("zoom abaixo de 1 é entrada inválida, não clamp", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 0.5 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Recorte inválido" });
  });

  it("usuário inexistente: 404 depois do gate", async () => {
    // O gate é `self OU MANAGE_USERS`: um VOLUNTARIO estranho recebe 403 antes de o 404 existir.
    // Para o 404, o ator é o próprio id inexistente — a ordem medida no upload (V5-3) é a mesma.
    login(["VOLUNTARIO"], 999);
    const response = await PUT(cropRequest({ x: 0.5, y: 0.5, zoom: 2 }), context({ id: "999", slot: "banner" }));
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Usuário não encontrado" });
  });
});

describe("a escrita e o clamp", () => {
  it("recorte da própria capa: grava os três parâmetros e devolve o usuário", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 0.3, y: 0.6, zoom: 2 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.user.bannerCropX).toBe(0.3);
    expect(body.user.bannerCropY).toBe(0.6);
    expect(body.user.bannerCropZoom).toBe(2);
    expect(mocks.users.get(7)?.bannerCropZoom).toBe(2);
  });

  it("zoom acima do máximo entra no intervalo; centro fora da janela do zoom entra na janela", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await PUT(cropRequest({ x: 1, y: 0, zoom: 12 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.user.bannerCropZoom).toBe(4);
    // Janela 1/4: centro permitido em [0.125, 0.875].
    expect(body.user.bannerCropX).toBeCloseTo(0.875, 6);
    expect(body.user.bannerCropY).toBeCloseTo(0.125, 6);
  });

  it("MANAGE_USERS grava o recorte de outra pessoa (é o gate do perfil, DEC-137)", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT(cropRequest({ x: 0.25, y: 0.25, zoom: 1.5 }), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(200);
    expect(mocks.users.get(7)?.bannerCropZoom).toBe(1.5);
  });
});
