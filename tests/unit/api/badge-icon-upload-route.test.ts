// @vitest-environment node
/**
 * plan-v16 S03 (R3/R4, INV1-INV5, DEC-243) — rotas PUT/DELETE do arquivo de ícone do badge.
 *
 * Mesma postura das capas: módulo REAL sobre porta falsa, só sessão e bucket dobrados;
 * allowlist, teto, magic bytes e montagem de chave ficam os de produção. O que congela:
 *  1. ordem 401 → 400 (id) → 403 (antes de ler o corpo E antes do lookup do badge) → 404;
 *  2. o gate é o mesmo da gestão de badges ("Sem permissão para atualizar badges"), e o
 *     403 não toca o bucket;
 *  3. só imagem passa: PNG disfarçado de JPEG sai em 400 e nenhum objeto é criado; PDF é
 *     recusado pela allowlist;
 *  4. o byte que entra no bucket é o CONVERTIDO a WebP, nunca o `.png` do upload; a chave
 *     sai do prefixo `badges/<id>` com UUID;
 *  5. trocar apaga o objeto velho depois de o registro apontar para o novo; registro
 *     falhando remove o objeto NOVO;
 *  6. DELETE apaga o objeto e zera a coluna.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextRequest } from "next/server";

import type { Badge } from "@/backend/domain";
import { createGamificationModule } from "@/backend/modules/gamification";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  badges: new Map<number, Badge>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  failUpdate: false,
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
    async update(badge: Badge) {
      if (mocks.failUpdate) {
        throw new Error("falha simulada do banco ao gravar a chave do ícone");
      }
      mocks.badges.set(badge.id!, badge);
      return badge;
    },
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
      mocks.puts.push({ key, contentType, bytes: body.byteLength });
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
      mocks.removes.push(key);
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

import { REAL_PNG_BYTES } from "@/tests/mocks/fixtures/image-bytes";
import { DELETE as DELETE_ICON, PUT as UPLOAD_ICON } from "@/app/api/badges/[id]/icon/route";

const PNG_BYTES = REAL_PNG_BYTES;
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))]);

function login(roles: string[], id = 1) {
  mocks.session = { id, email: "gestor@lab.com", name: "Gestor", roles, status: "active" };
}

function uploadRequest(id: number, file: File | null) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new NextRequest(new URL(`/api/badges/${id}/icon`, "http://localhost:3000"), {
    method: "PUT",
    body: form,
  });
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.badges.clear();
  mocks.objects.clear();
  mocks.puts = [];
  mocks.removes = [];
  mocks.failUpdate = false;
  mocks.bucketConfigured = true;
});

describe("PUT /api/badges/<id>/icon", () => {
  it("sem sessão é 401", async () => {
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).toBe(401);
  });

  it("id inválido é 400", async () => {
    login(["COORDENADOR"]);
    const response = await UPLOAD_ICON(uploadRequest(0, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "0" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Badge inválido");
  });

  it("não-gestor com corpo válido é 403, e o bucket não é tocado", async () => {
    login(["VOLUNTARIO"]);
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).toBe(403);
    expect((await read(response)).error).toBe("Sem permissão para atualizar badges");
    expect(mocks.puts).toHaveLength(0);
  });

  it("não-gestor com badge inexistente é 403 — o gate corre antes do lookup", async () => {
    login(["VOLUNTARIO"]);
    const response = await UPLOAD_ICON(uploadRequest(99, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "99" }));
    expect(response.status).toBe(403);
  });

  it("gestor com badge inexistente é 404", async () => {
    login(["COORDENADOR"]);
    const response = await UPLOAD_ICON(uploadRequest(99, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "99" }));
    expect(response.status).toBe(404);
    expect(mocks.puts).toHaveLength(0);
  });

  it("sem arquivo é 400", async () => {
    login(["COORDENADOR"]);
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, null), context({ id: "7" }));
    expect(response.status).toBe(400);
    expect((await read(response)).error).toBe("Arquivo é obrigatório");
  });

  it("PNG bom: o CONVERTIDO a webp entra no bucket, a chave sai do prefixo, e a coluna grava", async () => {
    login(["COORDENADOR"]);
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(mocks.puts).toHaveLength(1);
    const put = mocks.puts[0];
    expect(put.contentType).toBe("image/webp");
    expect(put.key).toMatch(/^badges\/7\/[0-9a-f-]+\.webp$/);
    expect(body.iconKey).toBe(put.key);
    expect(mocks.badges.get(7)?.iconKey).toBe(put.key);
    // o byte gravado é webp, não o PNG do upload (PNG começa com 0x89 'PNG')
    expect(Buffer.from(mocks.objects.get(put.key)!.body).subarray(0, 4).toString("hex")).not.toBe("89504e47");
  });

  it("PNG disfarçado de JPEG é recusado pelo magic bytes, e nada é escrito", async () => {
    login(["COORDENADOR"]);
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "foto.jpg", { type: "image/jpeg" })), context({ id: "7" }));
    expect(response.status).toBe(400);
    expect(mocks.puts).toHaveLength(0);
    expect(mocks.badges.get(7)?.iconKey).toBeNull();
  });

  it("PDF é recusado pela allowlist de imagem", async () => {
    login(["COORDENADOR"]);
    mocks.badges.set(7, badgeRow(7, null));
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" })), context({ id: "7" }));
    expect(response.status).toBe(400);
    expect(mocks.puts).toHaveLength(0);
  });

  it("acima do teto de 5 MB é recusado", async () => {
    login(["COORDENADOR"]);
    mocks.badges.set(7, badgeRow(7, null));
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(PNG_BYTES);
    const response = await UPLOAD_ICON(uploadRequest(7, new File([big], "big.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).toBe(400);
    expect(mocks.puts).toHaveLength(0);
  });

  it("trocar o ícone apaga o objeto velho depois de o registro apontar para o novo", async () => {
    login(["COORDENADOR"]);
    const oldKey = "badges/7/velho.webp";
    mocks.badges.set(7, badgeRow(7, oldKey));
    mocks.objects.set(oldKey, { body: new Uint8Array([0x52, 0x49, 0x46, 0x46]), contentType: "image/webp" });
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).toBe(200);
    expect(mocks.removes).toEqual([oldKey]);
    expect(mocks.objects.has(oldKey)).toBe(false);
  });

  it("registro falhando remove o objeto NOVO e a coluna fica como era", async () => {
    login(["COORDENADOR"]);
    const oldKey = "badges/7/velho.webp";
    mocks.badges.set(7, badgeRow(7, oldKey));
    mocks.failUpdate = true;
    const response = await UPLOAD_ICON(uploadRequest(7, new File([PNG_BYTES], "icon.png", { type: "image/png" })), context({ id: "7" }));
    expect(response.status).not.toBe(200);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.removes).toEqual([mocks.puts[0].key]);
    expect(mocks.badges.get(7)?.iconKey).toBe(oldKey);
  });
});

describe("DELETE /api/badges/<id>/icon", () => {
  it("não-gestor é 403", async () => {
    login(["VOLUNTARIO"]);
    mocks.badges.set(7, badgeRow(7, "badges/7/x.webp"));
    const response = await DELETE_ICON(undefined as never, context({ id: "7" }));
    expect(response.status).toBe(403);
    expect(mocks.removes).toHaveLength(0);
  });

  it("sem sessão é 401", async () => {
    const response = await DELETE_ICON(undefined as never, context({ id: "7" }));
    expect(response.status).toBe(401);
  });

  it("badge inexistente é 404", async () => {
    login(["COORDENADOR"]);
    const response = await DELETE_ICON(undefined as never, context({ id: "99" }));
    expect(response.status).toBe(404);
  });

  it("apaga o objeto e zera a coluna", async () => {
    login(["COORDENADOR"]);
    const key = "badges/7/x.webp";
    mocks.badges.set(7, badgeRow(7, key));
    mocks.objects.set(key, { body: new Uint8Array([0x52, 0x49, 0x46, 0x46]), contentType: "image/webp" });
    const response = await DELETE_ICON(undefined as never, context({ id: "7" }));
    expect(response.status).toBe(200);
    expect(mocks.removes).toEqual([key]);
    expect(mocks.badges.get(7)?.iconKey).toBeNull();
  });
});
