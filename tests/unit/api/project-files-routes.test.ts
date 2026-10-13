// @vitest-environment node
/**
 * V5-2c/V5-2d (DEC-61/63/101/102/133/134) — rotas de entregáveis, anexos e imagem do projeto.
 *
 * O módulo é REAL sobre portas falsas (lição do B6-2a: um duplo que devolve o módulo inteiro
 * faz o 403 sumir do teste em vez de falhar). Só duas coisas são dobradas: a sessão e a
 * INSTÂNCIA do bucket — `validateBlobUpload`, `newBlobKey` e a tabela de magic bytes continuam
 * os de produção, porque é exatamente neles que o teste quer bater.
 *
 * O que este arquivo congela:
 *   1. A ordem 401 → 404 → 403 → 400, e em upload o 403 vem ANTES de qualquer byte escrito no
 *      bucket. Sem isso, quem não gerencia o projeto empurra arquivo e só depois é recusado.
 *   2. Que tipo/tamanho/assinatura são decididos pelo seam, não pela rota: um PNG disfarçado
 *      de PDF sai em 400 e nenhum objeto é criado.
 *   3. Que o bucket não é escrito quando a autorização recusa, e que o objeto é removido quando
 *      o registro falha depois do put (compensação).
 *   4. Que id de entregável/anexo de OUTRO projeto responde 404, não "achei e editei".
 *   5. V5-2d: imagem é só imagem (PDF é blob válido do bucket e não é capa), o slot é uma lista
 *      fechada, trocar imagem apaga o objeto velho, e o projeto guarda a chave, nunca um caminho.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import type { Role } from "@/backend/domain";
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port";
import type {
  ProjectAttachmentRecord,
  ProjectAttachmentsPort,
} from "@/backend/modules/project-management/application/ports/project-attachments.repository";
import type {
  ProjectDeliverableRecord,
  ProjectDeliverablesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverables.repository";
import type {
  ProjectManagementMembershipPort,
} from "@/backend/modules/project-management/application/ports/project-membership.repository";
import type {
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  deliverables: [] as ProjectDeliverableRecord[],
  attachments: [] as ProjectAttachmentRecord[],
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  failAttachmentCreate: false,
  failProjectUpdate: false,
  bucketConfigured: true,
  nextId: 100,
}));

// --- atores e memberships do cenário -------------------------------------------------------
// 1: COORDENADOR sem membership -> gerencia pelo papel global (quirk congelado do domínio).
// 2: líder do projeto sem membership -> acessa, NÃO gerencia.
// 3: membership GERENTE_PROJETO -> gerencia.
// 4: VOLUNTARIO sem nada -> 403 em tudo.
// 5: membership COLABORADOR -> acessa, não gerencia.
const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  2: ["VOLUNTARIO"],
  3: ["VOLUNTARIO"],
  4: ["VOLUNTARIO"],
  5: ["VOLUNTARIO"],
};
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
  "10:5": { id: 50, roles: ["COLABORADOR"] },
};

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
    // V5-2d: o slot de imagem escreve por aqui. O duplo guarda o que foi escrito, porque os
    // testes de imagem precisam ver a chave anterior e a nova no mesmo projeto.
    async update(record) {
      if (mocks.failProjectUpdate) {
        throw new Error("falha simulada do banco ao gravar a imagem");
      }
      const current = mocks.projects.get(record.id ?? -1) ?? projectRow(record.id ?? -1);
      const next = { ...current, ...record };
      mocks.projects.set(next.id ?? -1, next);
      return next;
    },
    delete: notUsed("projects.delete"),
  };

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId, userId) {
      return MEMBERSHIPS[`${projectId}:${userId}`] ?? null;
    },
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
  };

  const actors: ProjectActorsPort = {
    async findActor(userId) {
      const roles = ACTOR_ROLES[userId];
      return roles ? { id: userId, roles } : null;
    },
  };

  const deliverables: ProjectDeliverablesPort = {
    async listByProjectId(projectId) {
      return mocks.deliverables.filter((row) => row.projectId === projectId);
    },
    async findById(id) {
      return mocks.deliverables.find((row) => row.id === id) ?? null;
    },
    async create(input) {
      const row: ProjectDeliverableRecord = {
        id: ++mocks.nextId,
        projectId: input.projectId,
        name: input.name,
        quantity: input.quantity,
        createdAt: "2026-10-13T12:00:00.000Z",
      };
      mocks.deliverables.push(row);
      return row;
    },
    async update(id, fields) {
      const row = mocks.deliverables.find((item) => item.id === id);
      if (!row) throw new Error("update de entregável inexistente");
      row.name = fields.name;
      row.quantity = fields.quantity;
      return row;
    },
    async delete(id) {
      mocks.deliverables = mocks.deliverables.filter((row) => row.id !== id);
    },
  };

  const attachments: ProjectAttachmentsPort = {
    async listByProjectId(projectId) {
      return mocks.attachments.filter((row) => row.projectId === projectId);
    },
    async findById(id) {
      return mocks.attachments.find((row) => row.id === id) ?? null;
    },
    async create(input) {
      if (mocks.failAttachmentCreate) {
        throw new Error("falha simulada do banco ao gravar o anexo");
      }
      const row: ProjectAttachmentRecord = {
        id: ++mocks.nextId,
        projectId: input.projectId,
        blobKey: input.blobKey,
        name: input.name,
        contentType: input.contentType,
        size: input.size,
        uploadedBy: input.uploadedBy,
        uploadedAt: "2026-10-13T12:00:00.000Z",
      };
      mocks.attachments.push(row);
      return row;
    },
    async delete(id) {
      mocks.attachments = mocks.attachments.filter((row) => row.id !== id);
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({
        ports: { projects, memberships, actors, deliverables, attachments },
      }),
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

// Só a INSTÂNCIA do bucket é trocada: allowlist, teto, magic bytes e montagem de chave seguem
// os de produção (é neles que este arquivo bate).
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

import { DELETE as DELETE_ATTACHMENT, GET as GET_ATTACHMENT } from "@/app/api/projects/[id]/attachments/[attachmentId]/route";
import { GET as GET_ATTACHMENT_FILE } from "@/app/api/projects/[id]/attachments/[attachmentId]/file/route";
import { GET as LIST_ATTACHMENTS, POST as UPLOAD_ATTACHMENT } from "@/app/api/projects/[id]/attachments/route";
import { DELETE as DELETE_DELIVERABLE, PUT as PUT_DELIVERABLE } from "@/app/api/projects/[id]/deliverables/[deliverableId]/route";
import { GET as LIST_DELIVERABLES, POST as CREATE_DELIVERABLE } from "@/app/api/projects/[id]/deliverables/route";
import { DELETE as DELETE_IMAGE, PUT as UPLOAD_IMAGE } from "@/app/api/projects/[id]/images/[slot]/route";
import { GET as GET_IMAGE_FILE } from "@/app/api/projects/[id]/images/[slot]/file/route";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))]);

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

/**
 * As rotas do Next recebem `{ params: Promise<…> }` (Next 15). Chamar o handler com um só
 * argumento dá `Cannot read properties of undefined` e o 500 disfarça qualquer coisa: o
 * contexto é montado aqui, uma vez, com o mesmo formato que o servidor entrega.
 */
function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function jsonRequest(method: string, path: string, body?: unknown) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function uploadRequest(file: File, path = "/api/projects/10/attachments") {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", body: form });
}

const read = async (response: Response) => await response.json();

beforeEach(() => {
  mocks.session = null;
  mocks.projects = new Map<number, ProjectRecord>([
    [10, projectRow(10)],
    [20, projectRow(20)],
  ]);
  mocks.deliverables = [
    { id: 101, projectId: 10, name: "Relatório parcial", quantity: 1, createdAt: "2026-10-01T12:00:00.000Z" },
    { id: 102, projectId: 20, name: "Entregável de outro projeto", quantity: 3, createdAt: "2026-10-01T12:00:00.000Z" },
  ];
  mocks.attachments = [
    {
      id: 201,
      projectId: 10,
      blobKey: "projects/10/attachments/um-pdf.pdf",
      name: "um-pdf.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.byteLength,
      uploadedBy: 1,
      uploadedAt: "2026-10-01T12:00:00.000Z",
    },
  ];
  mocks.objects.clear();
  mocks.objects.set("projects/10/attachments/um-pdf.pdf", { body: PDF_BYTES, contentType: "application/pdf" });
  mocks.puts = [];
  mocks.removes = [];
  mocks.failAttachmentCreate = false;
  mocks.failProjectUpdate = false;
  mocks.bucketConfigured = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("entregáveis — ordem 401 → 404 → 403 → 400", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await LIST_DELIVERABLES(
      jsonRequest("GET", "/api/projects/10/deliverables"),
      context({ id: "10" }),
    );
    expect(response.status).toBe(401);
  });

  it("projeto inexistente: 404", async () => {
    login(["COORDENADOR"], 1);
    const response = await LIST_DELIVERABLES(
      jsonRequest("GET", "/api/projects/999/deliverables"),
      context({ id: "999" }),
    );
    expect(response.status).toBe(404);
    // Corpo de erro de domínio é o superset do DEC-53 (`error` + `code` + `details`); o que
    // este arquivo congela é a mensagem e o status. Os 400 de ROTA continuam `{ error }` seco.
    expect(await read(response)).toMatchObject({ error: "Projeto não encontrado" });
  });

  it("id que não é número: 400 de rota, antes do use case", async () => {
    login(["COORDENADOR"], 1);
    const response = await LIST_DELIVERABLES(
      jsonRequest("GET", "/api/projects/abc/deliverables"),
      context({ id: "abc" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Projeto inválido" });
  });

  it("V5-2a (DEC-127): quem não tem relação nenhuma com o projeto LÊ a lista, e continua sem criar", async () => {
    login(["VOLUNTARIO"], 4); // sem membership, não é líder nem criador
    const list = await LIST_DELIVERABLES(
      jsonRequest("GET", "/api/projects/10/deliverables"),
      context({ id: "10" }),
    );
    expect(list.status).toBe(200);

    const created = await CREATE_DELIVERABLE(
      jsonRequest("POST", "/api/projects/10/deliverables", { name: "Slides", quantity: 2 }),
      context({ id: "10" }),
    );
    expect(created.status).toBe(403);
  });

  it("quem só acessa (COLABORADOR) lê a lista, mas não cria", async () => {
    login(["VOLUNTARIO"], 5);
    const list = await LIST_DELIVERABLES(
      jsonRequest("GET", "/api/projects/10/deliverables"),
      context({ id: "10" }),
    );
    expect(list.status).toBe(200);
    const body = await read(list);
    expect(body.deliverables.map((d: { id: number }) => d.id)).toEqual([101]);

    const created = await CREATE_DELIVERABLE(
      jsonRequest("POST", "/api/projects/10/deliverables", { name: "Slides", quantity: 2 }),
      context({ id: "10" }),
    );
    expect(created.status).toBe(403);
  });

  it("cria com nome aparado e quantidade ausente virando 1", async () => {
    login(["COORDENADOR"], 1);
    const response = await CREATE_DELIVERABLE(
      jsonRequest("POST", "/api/projects/10/deliverables", { name: "  Relatório final  " }),
      context({ id: "10" }),
    );
    expect(response.status).toBe(201);
    const body = await read(response);
    expect(body.deliverable.name).toBe("Relatório final");
    expect(body.deliverable.quantity).toBe(1);
    expect(body.deliverable.projectId).toBe(10);
  });

  it("quantidade lixo é 400 com a mensagem congelada, não 1 em silêncio", async () => {
    login(["COORDENADOR"], 1);
    const response = await CREATE_DELIVERABLE(
      jsonRequest("POST", "/api/projects/10/deliverables", { name: "Artigo", quantity: "muitas" }),
      context({ id: "10" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({
      error: "Dados inválidos: Quantidade do entregável deve ser um inteiro maior que zero",
    });
  });

  it("atualização parcial mantém o que o corpo não menciona", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT_DELIVERABLE(
      jsonRequest("PUT", "/api/projects/10/deliverables/101", { quantity: 7 }),
      context({ id: "10", deliverableId: "101" }),
    );
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.deliverable.quantity).toBe(7);
    expect(body.deliverable.name).toBe("Relatório parcial");
  });

  it("entregável de OUTRO projeto responde 404, não 'achei e editei'", async () => {
    login(["COORDENADOR"], 1);
    const response = await PUT_DELIVERABLE(
      jsonRequest("PUT", "/api/projects/10/deliverables/102", { quantity: 9 }),
      context({ id: "10", deliverableId: "102" }),
    );
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Entregável não encontrado" });
  });

  it("apaga", async () => {
    login(["COORDENADOR"], 1);
    const response = await DELETE_DELIVERABLE(
      jsonRequest("DELETE", "/api/projects/10/deliverables/101"),
      context({ id: "10", deliverableId: "101" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.deliverables.map((d) => d.id)).toEqual([102]);
  });
});

describe("anexos — o 403 vem antes de qualquer byte no bucket", () => {
  it("sem gestão: 403 e NENHUM objeto escrito", async () => {
    login(["VOLUNTARIO"], 5); // COLABORADOR: acessa, não gerencia
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([PNG_BYTES], "foto.png", { type: "image/png" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.puts).toEqual([]);
    expect(mocks.attachments).toHaveLength(1);
  });

  it("sem sessão: 401 e nenhum objeto escrito", async () => {
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([PNG_BYTES], "foto.png", { type: "image/png" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(401);
    expect(mocks.puts).toEqual([]);
  });

  it("PNG disfarçado de PDF: 400 pelo seam, e nenhum objeto escrito", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([PNG_BYTES], "disfarçado.pdf", { type: "application/pdf" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("Conteúdo não corresponde ao tipo declarado");
    expect(mocks.puts).toEqual([]);
  });

  it("tipo fora da allowlist do bucket: 400", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([new Uint8Array([1, 2, 3])], "notas.txt", { type: "text/plain" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(400);
    expect((await read(response)).error).toContain("não permitido");
    expect(mocks.puts).toEqual([]);
  });

  it("corpo sem arquivo: 400", async () => {
    login(["COORDENADOR"], 1);
    const empty = new NextRequest(new URL("/api/projects/10/attachments", "http://localhost:3000"), {
      method: "POST",
      body: new FormData(),
    });
    const response = await UPLOAD_ATTACHMENT(empty, context({ id: "10" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Arquivo é obrigatório" });
  });

  it("upload válido: chave com o prefixo do projeto, registro gravado, 201", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([PNG_BYTES], "foto do evento.png", { type: "image/png" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(201);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].key).toMatch(/^projects\/10\/attachments\/[0-9a-f-]{36}\.png$/);
    expect(mocks.puts[0].contentType).toBe("image/png");

    const body = await read(response);
    expect(body.attachment.name).toBe("foto do evento.png");
    expect(body.attachment.contentType).toBe("image/png");
    expect(body.attachment.size).toBe(PNG_BYTES.byteLength);
    expect(body.attachment.uploadedBy).toBe(1);
    expect(body.attachment.blobKey).toBe(mocks.puts[0].key);
  });

  it("se o registro falhar depois do put, o objeto é removido (compensação)", async () => {
    login(["COORDENADOR"], 1);
    mocks.failAttachmentCreate = true;
    const response = await UPLOAD_ATTACHMENT(
      uploadRequest(new File([PNG_BYTES], "foto.png", { type: "image/png" })),
      context({ id: "10" }),
    );
    expect(response.status).toBe(500);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.removes).toEqual([mocks.puts[0].key]);
    expect(mocks.objects.size).toBe(1); // só o pdf do cenário, nenhum órfão
  });

  it("listagem lê só o metadado, para quem tem acesso ao projeto", async () => {
    login(["VOLUNTARIO"], 2); // líder: acessa sem gerenciar
    const response = await LIST_ATTACHMENTS(
      jsonRequest("GET", "/api/projects/10/attachments"),
      context({ id: "10" }),
    );
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.attachments.map((a: { id: number }) => a.id)).toEqual([201]);
    expect(mocks.puts).toEqual([]);
  });

  it("servir o arquivo: 200 com tipo e nome, pela regra de acesso do projeto", async () => {
    login(["VOLUNTARIO"], 5);
    const response = await GET_ATTACHMENT_FILE(
      jsonRequest("GET", "/api/projects/10/attachments/201/file"),
      context({ id: "10", attachmentId: "201" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("UTF-8''um-pdf.pdf");
  });

  it("servir o arquivo é leitura do projeto: quem não participa lê o byte (V5-2a, DEC-127)", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await GET_ATTACHMENT_FILE(
      jsonRequest("GET", "/api/projects/10/attachments/201/file"),
      context({ id: "10", attachmentId: "201" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("anexo inexistente: 404", async () => {
    login(["COORDENADOR"], 1);
    const response = await GET_ATTACHMENT(
      jsonRequest("GET", "/api/projects/10/attachments/999"),
      context({ id: "10", attachmentId: "999" }),
    );
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Anexo não encontrado" });
  });

  it("apagar remove o registro e o objeto", async () => {
    login(["COORDENADOR"], 1);
    const response = await DELETE_ATTACHMENT(
      jsonRequest("DELETE", "/api/projects/10/attachments/201"),
      context({ id: "10", attachmentId: "201" }),
    );
    expect(response.status).toBe(200);
    expect(mocks.attachments).toEqual([]);
    expect(mocks.removes).toEqual(["projects/10/attachments/um-pdf.pdf"]);
  });

  it("apagar sem gestão: 403 e o objeto continua", async () => {
    login(["VOLUNTARIO"], 5); // COLABORADOR: acessa, não gerencia
    const response = await DELETE_ATTACHMENT(
      jsonRequest("DELETE", "/api/projects/10/attachments/201"),
      context({ id: "10", attachmentId: "201" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.removes).toEqual([]);
    expect(mocks.attachments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// V5-2d (DEC-102) — imagem do projeto (logo/banner)
// ---------------------------------------------------------------------------

function imageRequest(file: File, slot: string, method = "PUT") {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest(new URL(`/api/projects/10/images/${slot}`, "http://localhost:3000"), {
    method,
    body: form,
  });
}

function imageContext(slot: string) {
  return context({ id: "10", slot });
}

describe("imagem do projeto — logo e banner no bucket", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), imageContext("logo"));
    expect(response.status).toBe(401);
    expect(mocks.puts).toEqual([]);
  });

  it("slot que não é logo nem banner: 400 com a mensagem do domínio, e nenhum byte no bucket", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "capa"),
      imageContext("capa"),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ error: "Slot de imagem deve ser logo ou banner" });
    expect(mocks.puts).toEqual([]);
  });

  it("quem não gerencia: 403 antes do corpo ser lido, e nenhum byte no bucket", async () => {
    login(["VOLUNTARIO"], 5); // COLABORADOR: acessa, não gerencia
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      imageContext("logo"),
    );
    expect(response.status).toBe(403);
    expect(mocks.puts).toEqual([]);
    expect(mocks.projects.get(10)?.logoKey).toBeNull();
  });

  it("subir logo escreve o objeto sob o prefixo do slot e grava a chave no projeto", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      imageContext("logo"),
    );
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.project.logoKey).toMatch(/^projects\/10\/images\/logo\/[0-9a-f-]+\.png$/);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].key.startsWith("projects/10/images/logo/")).toBe(true);
    expect(mocks.projects.get(10)?.logoKey).toBe(body.project.logoKey);
  });

  it("trocar a imagem remove o objeto velho depois de o registro apontar para o novo", async () => {
    login(["COORDENADOR"], 1);
    const first = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "a.png", { type: "image/png" }), "banner"), imageContext("banner")),
    );
    const second = await read(
      await UPLOAD_IMAGE(
        imageRequest(new File([PNG_BYTES], "b.png", { type: "image/png" }), "banner"),
        imageContext("banner"),
      ),
    );
    expect(second.project.bannerKey).not.toBe(first.project.bannerKey);
    expect(mocks.removes).toEqual([first.project.bannerKey]);
    expect(mocks.objects.has(second.project.bannerKey)).toBe(true);
  });

  it("registro falhando depois do put: o objeto novo é removido, o projeto fica como estava", async () => {
    login(["COORDENADOR"], 1);
    mocks.failProjectUpdate = true;
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      imageContext("logo"),
    );
    expect(response.status).toBe(500);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.removes).toEqual([mocks.puts[0].key]);
    expect(mocks.objects.size).toBe(1); // só o anexo do cenário, nenhum objeto órfão
    expect(mocks.projects.get(10)?.logoKey).toBeNull();
  });

  it("PDF não é imagem de projeto: 400 e nenhum objeto, mesmo sendo blob válido do bucket", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PDF_BYTES], "doc.pdf", { type: "application/pdf" }), "logo"),
      imageContext("logo"),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({
      error: "Tipo de arquivo não permitido para imagem de projeto: application/pdf",
    });
    expect(mocks.puts).toEqual([]);
  });

  it("PNG declarado como JPEG: 400 do seam, nenhum objeto", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "disfarçado.jpg", { type: "image/jpeg" }), "banner"),
      imageContext("banner"),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({
      error: "Conteúdo não corresponde ao tipo declarado (image/jpeg)",
    });
    expect(mocks.puts).toEqual([]);
  });

  it("ambiente sem bucket: 503 nomeando as envs, e o registro não é tocado", async () => {
    login(["COORDENADOR"], 1);
    mocks.bucketConfigured = false;
    const response = await UPLOAD_IMAGE(
      imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"),
      imageContext("logo"),
    );
    expect(response.status).toBe(503);
    expect(await read(response)).toEqual({
      error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET",
    });
    expect(mocks.projects.get(10)?.logoKey).toBeNull();
  });

  it("ler o arquivo devolve o byte com o tipo do objeto", async () => {
    login(["COORDENADOR"], 1);
    const uploaded = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), imageContext("logo")),
    );
    const response = await GET_IMAGE_FILE(jsonRequest("GET", "/api/projects/10/images/logo/file"), imageContext("logo"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
    expect(uploaded.project.logoKey).toBeTruthy();
  });

  it("ler a imagem do projeto é leitura: quem não participa lê o byte (V5-2a, DEC-127)", async () => {
    login(["COORDENADOR"], 1);
    await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), imageContext("logo"));

    login(["VOLUNTARIO"], 4);
    const response = await GET_IMAGE_FILE(jsonRequest("GET", "/api/projects/10/images/logo/file"), imageContext("logo"));
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual(Array.from(PNG_BYTES));
  });

  it("slot sem imagem: 404, não um objeto vazio", async () => {
    login(["COORDENADOR"], 1);
    const response = await GET_IMAGE_FILE(jsonRequest("GET", "/api/projects/10/images/banner/file"), imageContext("banner"));
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Imagem não encontrada" });
  });

  it("remover limpa a coluna e apaga o objeto", async () => {
    login(["COORDENADOR"], 1);
    const uploaded = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), imageContext("logo")),
    );
    const response = await DELETE_IMAGE(jsonRequest("DELETE", "/api/projects/10/images/logo"), imageContext("logo"));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.project.logoKey).toBeNull();
    expect(mocks.removes).toEqual([uploaded.project.logoKey]);
    expect(mocks.projects.get(10)?.logoKey).toBeNull();
  });

  it("remover sem gestão: 403, coluna e objeto intactos", async () => {
    login(["COORDENADOR"], 1);
    const uploaded = await read(
      await UPLOAD_IMAGE(imageRequest(new File([PNG_BYTES], "logo.png", { type: "image/png" }), "logo"), imageContext("logo")),
    );
    login(["VOLUNTARIO"], 5);
    const response = await DELETE_IMAGE(jsonRequest("DELETE", "/api/projects/10/images/logo"), imageContext("logo"));
    expect(response.status).toBe(403);
    expect(mocks.removes).toEqual([]);
    expect(mocks.projects.get(10)?.logoKey).toBe(uploaded.project.logoKey);
  });
});
