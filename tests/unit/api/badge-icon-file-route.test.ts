// @vitest-environment node
/**
 * plan-v16 S02 (R2, DEC-243) — rota GET do arquivo de ícone do badge.
 *
 * Mesma postura das rotas de arquivo das capas: o módulo é REAL sobre porta falsa, só a
 * sessão e a instância do bucket são dobradas; a leitura é do autenticado (lista de badges
 * é leitura aberta) e a resposta é `private, max-age=86400` porque a chave carrega UUID.
 *
 * Congela: 401 sem sessão, 400 id inválido, 404 badge ausente, 404 sem chave, 404 chave
 * sem objeto, 503 sem bucket, 200 com o byte e o cache privado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Badge } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  badges: new Map<number, Badge>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  bucketConfigured: true,
}));

function badgeRow(id: number, iconKey: string | null): Badge {
  return {
    id,
    name: `Badge ${id}`,
    description: "desc",
    icon: "trophy",
    color: "#f59e0b",
    category: "milestone",
    criteria: null,
    slug: `badge-${id}`,
    effect: null,
    iconKey,
    isActive: true,
    createdBy: null,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const badges = {
    async findAll() { return [...mocks.badges.values()]; },
    async findById(id: number) { return mocks.badges.get(id) ?? null; },
    async findActive() { return [...mocks.badges.values()].filter((b) => b.isActive); },
    findByCategory: notUsed("findByCategory"),
    create: notUsed("create"),
    update: notUsed("update"),
    delete: notUsed("delete"),
  };
  const realGamification = createGamificationModule({
    ports: {
      badges,
      users: { findUserById: notUsed("users.findUserById"), findAllUsers: notUsed("users.findAllUsers") } as never,
      awardHistory: { find: notUsed("awardHistory") } as never,
      userBadges: { findByUserId: notUsed("userBadges") } as never,
      stats: {
        projectsCount: notUsed("projectsCount"),
        workSessionsCount: notUsed("workSessionsCount"),
        weeklyHoursSamples: notUsed("weeklyHoursSamples"),
        dailyLogDates: notUsed("dailyLogDates"),
      } as never,
    },
  });
  return { getBackendComposition: () => ({ gamification: realGamification }) };
});

vi.mock("@/lib/storage/blob-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/blob-store")>();
  const store: BlobStore = {
    async put(key, body, contentType) {
      mocks.objects.set(key, { body, contentType });
    },
    async get(key) {
      const object = mocks.objects.get(key);
      if (!object) return null;
      return { key, size: object.body.byteLength, contentType: object.contentType, body: object.body };
    },
    async head(key) {
      const object = mocks.objects.get(key);
      if (!object) return null;
      return { key, size: object.body.byteLength, contentType: object.contentType };
    },
    async remove(key) {
      mocks.objects.delete(key);
    },
  };
  return { ...actual, blobStoreFromEnv: () => (mocks.bucketConfigured ? store : null) };
});

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? { user: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { user: mocks.session },
}));

import { GET } from "@/app/api/badges/[id]/icon/file/route";

function request(id: number) {
  return GET(undefined as never, { params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  mocks.session = { id: 1, email: "coord@lab.com", name: "Coord", roles: ["COORDENADOR"], status: "active" };
  mocks.badges.clear();
  mocks.objects.clear();
  mocks.bucketConfigured = true;
});

describe("GET /api/badges/<id>/icon/file", () => {
  it("sem sessão é 401", async () => {
    mocks.session = null;
    mocks.badges.set(3, badgeRow(3, "badges/3/x.webp"));
    const response = await request(3);
    expect(response.status).toBe(401);
  });

  it("id inválido é 400 com a mensagem congelada", async () => {
    const response = await request(0);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Badge inválido");
  });

  it("badge inexistente é 404", async () => {
    const response = await request(99);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Badge não encontrado");
  });

  it("badge sem chave é 404 — a rota não inventa caminho", async () => {
    mocks.badges.set(3, badgeRow(3, null));
    const response = await request(3);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Ícone não encontrado");
  });

  it("chave sem objeto no bucket é 404", async () => {
    mocks.badges.set(3, badgeRow(3, "badges/3/sumiu.webp"));
    const response = await request(3);
    expect(response.status).toBe(404);
  });

  it("sem bucket é 503 com a mensagem do seam", async () => {
    mocks.bucketConfigured = false;
    mocks.badges.set(3, badgeRow(3, "badges/3/x.webp"));
    const response = await request(3);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("S3_ENDPOINT");
  });

  it("com chave e objeto: 200, o byte, content-type webp e cache private", async () => {
    const key = "badges/3/x.webp";
    mocks.badges.set(3, badgeRow(3, key));
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    mocks.objects.set(key, { body: webp, contentType: "image/webp" });
    const response = await request(3);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(webp);
  });
});
