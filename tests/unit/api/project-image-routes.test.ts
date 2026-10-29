// @vitest-environment node
/**
 * R12 (S12) — a imagem de capa do projeto entra no bucket como WebP.
 *
 * Mesma postura do arquivo de rotas de anexo: o módulo de projeto é REAL sobre portas falsas
 * (lição do B6-2a), e só a sessão e a INSTÂNCIA do bucket são dobradas. `newBlobKey`, a allowlist
 * de mime e a tabela de magic bytes seguem os de produção. O que este arquivo congela:
 *   1. Que o objeto gravado é WebP — ContentType `image/webp` e assinatura RIFF/WEBP — mesmo para
 *      upload PNG ou JPEG.
 *   2. Que a chave da coluna termina em `.webp` (não `.png`), e o GET serve o WebP com o mesmo
 *      caminho de chave (R15).
 *   3. Que o gate de gestão roda antes do byte ser escrito, e o 403 não cria objeto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { REAL_PNG_BYTES, REAL_JPEG_BYTES } from "@/tests/mocks/fixtures/image-bytes";

import { createProjectManagementModule } from "@/backend/modules/project-management";
import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import type { Role } from "@/backend/domain";
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";
import type { ProjectRecord, ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  bucketConfigured: true,
}));

function projectRow(id = 10): ProjectRecord {
  return {
    id,
    name: "Projeto",
    description: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 2,
    status: "active",
    links: null,
    points: 0,
    logoKey: null,
    bannerKey: null,
  };
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`);
  };
}

vi.mock("@/backend/composition/root", () => {
  const projects: ProjectRepositoryPort = {
    findAll: notUsed("projects.findAll"),
    findByLeaderId: notUsed("projects.findByLeaderId"),
    async findById(id) {
      return mocks.projects.get(id) ?? null;
    },
    create: notUsed("projects.create"),
    createWithCronograma: notUsed("projects.createWithCronograma"),
    async update(record) {
      const current = mocks.projects.get(record.id ?? -1) ?? projectRow(record.id ?? -1);
      const next = { ...current, ...record };
      mocks.projects.set(next.id ?? -1, next);
      return next;
    },
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  };
  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId, userId) {
      return MEMBERSHIPS[`${projectId}:${userId}`] ?? null;
    },
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
    listActiveMemberUserIds: notUsed("memberships.listActiveMemberUserIds"),
  };
  const actors: ProjectActorsPort = {
    async findActor(userId) {
      const roles = ACTOR_ROLES[userId];
      return roles ? { id: userId, roles } : null;
    },
  };
  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({
        ports: { projects, memberships, actors, deliverables: undefined, attachments: undefined },
      }),
    }),
  };
});

// 1: COORDENADOR gerencia pelo papel global; 5: membership COLABORADOR acessa, não gerencia.
const ACTOR_ROLES: Record<number, string[]> = { 1: ["COORDENADOR"], 5: ["VOLUNTARIO"] };
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:5": { id: 50, roles: ["COLABORADOR"] },
};

vi.mock("@/lib/auth/api-guard", () => ({
  requireApiActor: async () =>
    mocks.session === null
      ? { actor: null, error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }) }
      : { actor: { id: mocks.session.id, roles: mocks.session.roles } },
}));

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

import { PUT as UPLOAD_IMAGE } from "@/app/api/projects/[id]/images/[slot]/route";
import { GET as GET_IMAGE_FILE } from "@/app/api/projects/[id]/images/[slot]/file/route";

const PNG_BYTES = REAL_PNG_BYTES;
const JPEG_BYTES = REAL_JPEG_BYTES;

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function imageRequest(file: File, slot: string, projectId = 10) {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest(new URL(`/api/projects/${projectId}/images/${slot}`, "http://localhost:3000"), {
    method: "PUT",
    body: form,
  });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.projects = new Map([[10, projectRow()]]);
  mocks.objects.clear();
  mocks.puts = [];
  mocks.removes = [];
  mocks.bucketConfigured = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("imagem de capa do projeto vira WebP no bucket (R12)", () => {
  it("upload de PNG grava o objeto como WebP, com ContentType image/webp e chave .webp", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      context({ id: "10", slot: "logo" }),
    );
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.project.logoKey).toMatch(/^projects\/10\/images\/logo\/[0-9a-f-]+\.webp$/);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].contentType).toBe("image/webp");
    // RIFF....WEBP: a assinatura do contêiner WebP, não a do PNG de origem.
    expect(Array.from(mocks.objects.get(mocks.puts[0].key)!.body.subarray(0, 4))).toEqual([0x52, 0x49, 0x46, 0x46]);
    expect(mocks.projects.get(10)?.logoKey).toBe(body.project.logoKey);
  });

  it("upload de JPEG na capa do projeto também sai WebP", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([JPEG_BYTES], "capa.jpg", { type: "image/jpeg" }), "banner"),
      context({ id: "10", slot: "banner" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.puts[0].contentType).toBe("image/webp");
    expect((await read(response)).project.bannerKey).toMatch(/\.webp$/);
  });

  it("o portal de leitura serve o WebP com o mesmo caminho de chave (R15)", async () => {
    login(["COORDENADOR"], 1);
    const uploaded = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), context({ id: "10", slot: "logo" })),
    );
    const response = await GET_IMAGE_FILE(
      new Request(new URL("/api/projects/10/images/logo/file", "http://localhost:3000")),
      context({ id: "10", slot: "logo" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(
      Array.from(mocks.objects.get(uploaded.project.logoKey)!.body),
    );
  });

  it("quem não gerencia é recusado antes de qualquer byte escrito no bucket", async () => {
    login(["VOLUNTARIO"], 5); // COLABORADOR: acessa, não gerencia
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      context({ id: "10", slot: "logo" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.puts).toEqual([]);
    expect(mocks.projects.get(10)?.logoKey).toBeNull();
  });
});
