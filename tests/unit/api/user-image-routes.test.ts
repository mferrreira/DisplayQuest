// @vitest-environment node
/**
 * V5-3 (DEC-137) — rotas da imagem de perfil (capa).
 *
 * Mesma postura do arquivo de rotas de arquivo do projeto: o módulo é REAL sobre uma porta falsa
 * (lição do B6-2a — um duplo que devolve o módulo inteiro faz o 403 sumir do teste em vez de
 * falhar). Só duas coisas são dobradas: a sessão e a INSTÂNCIA do bucket. `validateBlobUpload`,
 * `newBlobKey`, a allowlist de mime e a tabela de magic bytes continuam os de produção, porque é
 * exatamente neles que o teste quer bater.
 *
 * O que este arquivo congela:
 *   1. A ordem 401 → 400 (entrada) → 403 → 404 → 400 (arquivo), e em upload o 403 vem ANTES de
 *      qualquer byte escrito no bucket (DEC-133).
 *   2. Que a escrita é `self OU MANAGE_USERS` com a mensagem própria do perfil ("Não autorizado"),
 *      e que a LEITURA é aberta ao autenticado — quem não é a pessoa lê o byte (DEC-127/136).
 *   3. Que tipo/tamanho/assinatura são decididos pelo seam: PNG disfarçado de JPEG sai em 400 e
 *      nenhum objeto é criado.
 *   4. Que trocar a capa apaga o objeto velho depois de o registro apontar para o novo, e que
 *      registro falhando remove o objeto NOVO.
 *   5. Que a coluna guarda a CHAVE (`users/<id>/images/banner/<uuid>.png`), nunca um caminho de disco.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { emptyPersonData } from "@/backend/domain";
import { createUserManagementModule } from "@/backend/modules/user-management";
import type { UserRecord } from "@/backend/modules/user-management/application/ports/user.repository";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  users: new Map<number, UserRecord>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  failUserUpdate: false,
  bucketConfigured: true,
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
    bannerKey: null,
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
    // Cópia de propósito: o use case muta o record que recebeu antes de gravar, e um record vivo do
    // Map deixaria a falha do `update` parecer sucesso (a gravação já teria acontecido no fake).
    async findById(id: number) {
      const row = mocks.users.get(id);
      return row ? { ...row } : null;
    },
    async update(record: UserRecord) {
      if (mocks.failUserUpdate) {
        throw new Error("falha simulada do banco ao gravar a capa");
      }
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

// Só a INSTÂNCIA do bucket é trocada: allowlist, teto, magic bytes e montagem de chave seguem os
// de produção (é neles que este arquivo bate).
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

import { DELETE as DELETE_IMAGE, PUT as UPLOAD_IMAGE } from "@/app/api/users/[id]/images/[slot]/route";
import { GET as GET_IMAGE_FILE } from "@/app/api/users/[id]/images/[slot]/file/route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))]);

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

/** Rotas Next 15 recebem `{ params: Promise<…> }` (licão medida no V5-2c). */
function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function imageRequest(file: File | null, slot = "banner", userId = 7) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new NextRequest(new URL(`/api/users/${userId}/images/${slot}`, "http://localhost:3000"), {
    method: "PUT",
    body: form,
  });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.users = new Map<number, UserRecord>([
    [7, userRow(7)],
    [9, userRow(9)],
  ]);
  mocks.objects.clear();
  mocks.puts = [];
  mocks.removes = [];
  mocks.failUserUpdate = false;
  mocks.bucketConfigured = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subir a capa — ordem e gate antes do byte", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.puts).toEqual([]);
  });

  it("id que não é número: 400 de rota, antes do use case", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "abc", slot: "banner" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Usuário inválido" });
  });

  it("slot fora da lista fechada: 400 com a mensagem do domínio", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "avatar" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Slot de imagem deve ser banner" });
  });

  it("capa de OUTRA pessoa por quem não gerencia: 403 'Não autorizado' e NENHUM objeto escrito", async () => {
    login(["VOLUNTARIO"], 9);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(403);
    expect(await read(response)).toMatchObject({ error: "Não autorizado" });
    // O gate roda antes do corpo: sem isto, quem não pode escrever empurra byte ao bucket e só
    // depois recebe o 403 (DEC-133).
    expect(mocks.puts).toEqual([]);
    expect(mocks.users.get(7)?.bannerKey).toBeNull();
  });

  it("subir a própria capa escreve o objeto sob o prefixo do slot e grava a chave no usuário", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.user.bannerKey).toMatch(/^users\/7\/images\/banner\/[0-9a-f-]+\.png$/);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].key.startsWith("users/7/images/banner/")).toBe(true);
    expect(mocks.users.get(7)?.bannerKey).toBe(body.user.bannerKey);
  });

  it("MANAGE_USERS escreve a capa de outra pessoa (é o gate do perfil, medido em B6-4)", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.users.get(7)?.bannerKey).toMatch(/^users\/7\/images\/banner\//);
  });

  it("usuário inexistente: 404, e o objeto escrito é removido", async () => {
    login(["VOLUNTARIO"], 999);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "999", slot: "banner" }),
    );
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Usuário não encontrado" });
    expect(mocks.removes).toEqual(mocks.puts.map((put) => put.key));
  });
});

describe("o arquivo é decidido pelo seam, não pela rota", () => {
  it("PNG disfarçado de JPEG: 400 pela assinatura e nenhum objeto escrito", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.jpg", { type: "image/jpeg" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.puts).toEqual([]);
  });

  it("PDF não é capa: mime fora da allowlist de imagem, recusado pelo seam", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PDF_BYTES], "relatorio.pdf", { type: "application/pdf" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({
      error: "Tipo de arquivo não permitido para imagem de perfil: application/pdf",
    });
    expect(mocks.puts).toEqual([]);
  });

  it("corpo sem arquivo: 400 com a mensagem congelada", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(imageRequest(null), context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Arquivo é obrigatório" });
  });

  it("sem bucket configurado: 503, e a coluna não muda", async () => {
    mocks.bucketConfigured = false;
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(503);
    expect(mocks.users.get(7)?.bannerKey).toBeNull();
  });
});

describe("trocar e tirar a capa", () => {
  it("trocar a capa remove o objeto velho depois de o registro apontar para o novo", async () => {
    login(["VOLUNTARIO"], 7);
    const first = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "a.png", { type: "image/png" })), context({ id: "7", slot: "banner" })),
    );
    const previousKey = first.user.bannerKey as string;

    const second = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "b.png", { type: "image/png" })), context({ id: "7", slot: "banner" })),
    );
    expect(second.user.bannerKey).not.toBe(previousKey);
    expect(mocks.users.get(7)?.bannerKey).toBe(second.user.bannerKey);
    expect(mocks.removes).toEqual([previousKey]);
  });

  it("registro falhando remove o objeto NOVO: o usuário continua sem capa nova", async () => {
    mocks.failUserUpdate = true;
    login(["VOLUNTARIO"], 7);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(500);
    expect(mocks.removes).toEqual(mocks.puts.map((put) => put.key));
    expect(mocks.users.get(7)?.bannerKey).toBeNull();
  });

  it("tirar a capa: a coluna volta a vazio e o objeto sai do bucket", async () => {
    login(["VOLUNTARIO"], 7);
    const uploaded = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })), context({ id: "7", slot: "banner" })),
    );
    const key = uploaded.user.bannerKey as string;

    const response = await DELETE_IMAGE(null as unknown as Request, context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.user.bannerKey).toBeNull();
    expect(mocks.removes).toEqual([key]);
  });

  it("tirar a capa de OUTRA pessoa sem gestão: 403", async () => {
    login(["VOLUNTARIO"], 9);
    const response = await DELETE_IMAGE(null as unknown as Request, context({ id: "7", slot: "banner" }));
    expect(response.status).toBe(403);
  });
});

describe("servir o binário", () => {
  it("devolve o byte com o tipo do objeto e cache privado", async () => {
    login(["VOLUNTARIO"], 7);
    await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })), context({ id: "7", slot: "banner" }));

    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/users/7/images/banner/file", "http://localhost:3000")),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(PNG_BYTES));
  });

  it("leitura é do autenticado: outra pessoa lê o byte (DEC-127/136)", async () => {
    login(["VOLUNTARIO"], 7);
    await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "capa.png", { type: "image/png" })), context({ id: "7", slot: "banner" }));

    login(["VOLUNTARIO"], 9);
    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/users/7/images/banner/file", "http://localhost:3000")),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(200);
  });

  it("slot sem capa: 404 'Imagem não encontrada', não um objeto vazio", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/users/7/images/banner/file", "http://localhost:3000")),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Imagem não encontrada" });
  });

  it("usuário inexistente: 404 'Usuário não encontrado'", async () => {
    login(["VOLUNTARIO"], 7);
    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/users/999/images/banner/file", "http://localhost:3000")),
      context({ id: "999", slot: "banner" }),
    );
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Usuário não encontrado" });
  });

  it("sem sessão: 401 — o binário nunca é público", async () => {
    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/users/7/images/banner/file", "http://localhost:3000")),
      context({ id: "7", slot: "banner" }),
    );
    expect(response.status).toBe(401);
  });
});
