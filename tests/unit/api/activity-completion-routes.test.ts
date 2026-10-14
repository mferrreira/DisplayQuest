// @vitest-environment node
/**
 * V5-7a (DEC-76/99/133/157/162) — rotas de prova de atividade e de solicitar conclusão.
 *
 * O módulo é REAL sobre portas falsas (lição do B6-2a: um duplo do módulo inteiro faz o 403
 * sumir do teste em vez de falhar). Só a sessão e a INSTÂNCIA do bucket são dobradas;
 * `validateBlobUpload`, `newBlobKey` e a tabela de magic bytes continuam os de produção.
 *
 * O que este arquivo congela:
 *   1. Em upload, o 403 do gate da DEC-76 vem ANTES de qualquer byte escrito no bucket — o
 *      custo medido do anexo (DEC-133) vale igual para a prova.
 *   2. O gate de pedir não é o de gerenciar: COORDENADOR global sem membership e sem ser
 *      líder gerencia a grade e NÃO pede conclusão (DEC-76/77 — ele é o lado que aprova).
 *   3. A leitura de prova é aberta (DEC-127): VOLUNTARIO sem nada lista e baixa o binário.
 *   4. As recusas do solicitar: 409 por status, 400 da trava DEC-99, 400 da prova ausente
 *      (DEC-162) — todas com a frase do domínio, porque o mock e a tela dizem a mesma.
 *   5. Compensação: registro falhou, objeto sai do bucket.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createIdentityAccessModule } from "@/backend/modules/identity-access";
import { createProjectManagementModule } from "@/backend/modules/project-management";
import type { Role } from "@/backend/domain";
import type {
  ActivityFileRecord,
  ProjectActivityFilesPort,
} from "@/backend/modules/project-management/application/ports/project-activity-files.repository";
import type { ActivityTasksPort } from "@/backend/modules/project-management/application/ports/activity-tasks.port";
import type {
  ProjectActivityRecord,
  ProjectCronogramaPort,
} from "@/backend/modules/project-management/application/ports/project-cronograma.repository";
import type { ProjectManagementMembershipPort } from "@/backend/modules/project-management/application/ports/project-membership.repository";
import type {
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository";
import type { BlobStore } from "@/lib/storage/blob-store";

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  activities: new Map<number, ProjectActivityRecord>(),
  files: new Map<number, ActivityFileRecord>(),
  openTasks: new Map<number, number>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  requestWrites: [] as Array<{ id: number; status: string; requestedBy: number }>,
  failFileCreate: false,
  bucketConfigured: true,
  nextId: 100,
}));

// Atores do cenário:
// 1: COORDENADOR sem membership e sem ser líder -> gerencia a grade, NÃO pede (DEC-77).
// 2: líder sem membership -> pede.
// 3: membership GERENTE_PROJETO -> pede.
// 4: VOLUNTARIO sem nada -> não pede; lê (DEC-127).
// 5: membership COLABORADOR -> não pede.
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
  "10:5": { id: 50, roles: ["COLABORADOR"] },
};

function projectRow(id = 10): ProjectRecord {
  return {
    id,
    name: "Pesquisa em IA",
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

function activityRow(id: number, projectId: number, overrides: Partial<ProjectActivityRecord> = {}): ProjectActivityRecord {
  return {
    id,
    projectId,
    order: id,
    description: `Etapa ${id}`,
    responsibleId: null,
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    status: "OPEN",
    requestedBy: null,
    requestedAt: null,
    approvedBy: null,
    approvedAt: null,
    overdueNotifiedAt: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
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
    update: notUsed("projects.update"),
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

  const cronograma: ProjectCronogramaPort = {
    listGoals: notUsed("cronograma.listGoals"),
    findGoalById: notUsed("cronograma.findGoalById"),
    createGoal: notUsed("cronograma.createGoal"),
    updateGoal: notUsed("cronograma.updateGoal"),
    deleteGoal: notUsed("cronograma.deleteGoal"),
    async listActivities(projectId) {
      return [...mocks.activities.values()].filter((row) => row.projectId === projectId);
    },
    async findActivityById(id) {
      return mocks.activities.get(id) ?? null;
    },
    createActivity: notUsed("cronograma.createActivity"),
    updateActivity: notUsed("cronograma.updateActivity"),
    async requestActivity(id, fields) {
      mocks.requestWrites.push({ id, status: fields.status, requestedBy: fields.requestedBy });
      const current = mocks.activities.get(id);
      if (!current) throw new Error("atividade ausente no duplo");
      const next = { ...current, status: fields.status, requestedBy: fields.requestedBy, requestedAt: fields.requestedAt.toISOString() };
      mocks.activities.set(id, next);
      return next;
    },
    deleteActivity: notUsed("cronograma.deleteActivity"),
  };

  const activityFiles: ProjectActivityFilesPort = {
    async listByActivity(activityId) {
      return [...mocks.files.values()].filter((row) => row.activityId === activityId);
    },
    async findById(id) {
      return mocks.files.get(id) ?? null;
    },
    async countByActivity(activityId) {
      return [...mocks.files.values()].filter((row) => row.activityId === activityId).length;
    },
    async create(input) {
      if (mocks.failFileCreate) {
        throw new Error("falha simulada do banco ao gravar a prova");
      }
      const row: ActivityFileRecord = {
        id: ++mocks.nextId,
        activityId: input.activityId,
        blobKey: input.blobKey,
        name: input.name,
        contentType: input.contentType,
        size: input.size,
        uploadedBy: input.uploadedBy,
        uploadedAt: "2026-10-14T12:00:00.000Z",
      };
      mocks.files.set(row.id, row);
      return row;
    },
    async delete(id) {
      mocks.files.delete(id);
    },
  };

  const tasks: ActivityTasksPort = {
    async countOpenByActivity(activityId) {
      return mocks.openTasks.get(activityId) ?? 0;
    },
  };

  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({
        ports: { projects, memberships, cronograma, activityFiles, tasks },
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

import {
  GET as LIST_PROOFS,
  POST as UPLOAD_PROOF,
} from "@/app/api/projects/[id]/activities/[activityId]/files/route";
import { DELETE as DELETE_PROOF } from "@/app/api/projects/[id]/activities/[activityId]/files/[fileId]/route";
import { GET as GET_PROOF_FILE } from "@/app/api/projects/[id]/activities/[activityId]/files/[fileId]/file/route";
import { POST as REQUEST_COMPLETION } from "@/app/api/projects/[id]/activities/[activityId]/request-completion/route";

const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" };
}

/** Rotas Next 15 recebem `{ params: Promise<…> }` — o contexto é montado aqui, uma vez. */
function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function postRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST" });
}

function uploadRequest(file: File, path: string) {
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
  mocks.activities = new Map<number, ProjectActivityRecord>([
    [1, activityRow(1, 10)],
    [2, activityRow(2, 10, { status: "COMPLETION_REQUESTED", requestedBy: 2 })],
    [3, activityRow(3, 10, { status: "DONE" })],
    [4, activityRow(4, 10)],
    [5, activityRow(5, 20)],
  ]);
  mocks.files = new Map<number, ActivityFileRecord>([
    [
      201,
      {
        id: 201,
        activityId: 1,
        blobKey: "projects/10/activities/1/files/parcial.pdf",
        name: "parcial.pdf",
        contentType: "application/pdf",
        size: PDF_BYTES.byteLength,
        uploadedBy: 2,
        uploadedAt: "2026-10-01T12:00:00.000Z",
      },
    ],
  ]);
  mocks.openTasks = new Map<number, number>([[4, 2]]);
  mocks.objects = new Map<string, { body: Uint8Array; contentType: string }>([
    ["projects/10/activities/1/files/parcial.pdf", { body: PDF_BYTES, contentType: "application/pdf" }],
  ]);
  mocks.puts = [];
  mocks.removes = [];
  mocks.requestWrites = [];
  mocks.failFileCreate = false;
  mocks.bucketConfigured = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provas de atividade — upload com o gate antes do byte (DEC-133/162)", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await LIST_PROOFS(postRequest("/x"), context({ id: "10", activityId: "1" }));
    expect(response.status).toBe(401);
  });

  it("leitura é aberta (DEC-127): VOLUNTARIO sem nada lista as provas", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await LIST_PROOFS(postRequest("/x"), context({ id: "10", activityId: "1" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].name).toBe("parcial.pdf");
  });

  it("atividade de outro projeto: 404 na leitura", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await LIST_PROOFS(postRequest("/x"), context({ id: "10", activityId: "5" }));
    expect(response.status).toBe(404);
    expect(await read(response)).toMatchObject({ error: "Atividade não encontrada" });
  });

  it("líder sobe prova: 201, chave no prefixo da atividade, registro com quem subiu", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "ata.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(201);
    const body = await read(response);
    expect(body.file.uploadedBy).toBe(2);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.puts[0].key).toMatch(/^projects\/10\/activities\/1\/files\//);
  });

  it("membership de gestor sobe prova", async () => {
    login(["VOLUNTARIO"], 3);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "checklist.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(201);
  });

  it("COORDENADOR global sem membership e sem ser líder: 403 e NENHUM byte no bucket (gate antes do corpo, DEC-133)", async () => {
    login(["COORDENADOR"], 1);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "empurra.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.puts).toHaveLength(0);
  });

  it("membership COLABORADOR: 403 e nenhum byte no bucket", async () => {
    login(["VOLUNTARIO"], 5);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "empurra.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.puts).toHaveLength(0);
  });

  it("atividade inexistente: 404 antes do corpo — nenhum órfão no bucket", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "x.pdf", { type: "application/pdf" }), "/api/projects/10/activities/999/files"),
      context({ id: "10", activityId: "999" }),
    );
    expect(response.status).toBe(404);
    expect(mocks.puts).toHaveLength(0);
  });

  it("sem arquivo no form: 400", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await UPLOAD_PROOF(
      new NextRequest(new URL("/api/projects/10/activities/1/files", "http://localhost:3000"), {
        method: "POST",
        body: new FormData(),
      }),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({ error: "Arquivo é obrigatório" });
  });

  it("PNG disfarçado de PDF: 400 pelo seam, nenhum objeto criado", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PNG_BYTES], "disfarcado.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(400);
    expect(mocks.puts).toHaveLength(0);
  });

  it("registro falhou depois do put: o objeto é removido (compensação)", async () => {
    login(["VOLUNTARIO"], 2);
    mocks.failFileCreate = true;
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "quase.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(500);
    expect(mocks.puts).toHaveLength(1);
    expect(mocks.removes).toEqual([mocks.puts[0].key]);
  });

  it("bucket sem configuração: 503", async () => {
    login(["VOLUNTARIO"], 2);
    mocks.bucketConfigured = false;
    const response = await UPLOAD_PROOF(
      uploadRequest(new File([PDF_BYTES], "x.pdf", { type: "application/pdf" }), "/api/projects/10/activities/1/files"),
      context({ id: "10", activityId: "1" }),
    );
    expect(response.status).toBe(503);
  });

  it("líder apaga prova: 200 e o objeto sai do bucket depois do registro", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await DELETE_PROOF(postRequest("/x"), context({ id: "10", activityId: "1", fileId: "201" }));
    expect(response.status).toBe(200);
    expect(mocks.removes).toEqual(["projects/10/activities/1/files/parcial.pdf"]);
    expect(mocks.files.has(201)).toBe(false);
  });

  it("quem não pode pedir não apaga prova", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await DELETE_PROOF(postRequest("/x"), context({ id: "10", activityId: "1", fileId: "201" }));
    expect(response.status).toBe(403);
    expect(mocks.files.has(201)).toBe(true);
  });

  it("binário é do autenticado (DEC-127): VOLUNTARIO baixa com Content-Type e cache privado", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await GET_PROOF_FILE(postRequest("/x"), context({ id: "10", activityId: "1", fileId: "201" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("binário de prova de OUTRA atividade: 404", async () => {
    login(["VOLUNTARIO"], 4);
    const response = await GET_PROOF_FILE(postRequest("/x"), context({ id: "10", activityId: "4", fileId: "201" }));
    expect(response.status).toBe(404);
  });
});

describe("POST request-completion — as recusas do fluxo (DEC-76/99/162)", () => {
  it("sem sessão: 401", async () => {
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "1" }));
    expect(response.status).toBe(401);
  });

  it("líder solicita com prova e sem tarefa aberta: 200 e a atividade volta COMPLETION_REQUESTED", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "1" }));
    expect(response.status).toBe(200);
    const body = await read(response);
    expect(body.activity.status).toBe("COMPLETION_REQUESTED");
    expect(body.activity.requestedBy).toBe(2);
    expect(mocks.requestWrites).toHaveLength(1);
  });

  it("segunda solicitação: 409 com a frase do status", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "2" }));
    expect(response.status).toBe(409);
    expect(await read(response)).toMatchObject({ error: "A conclusão desta atividade já foi solicitada" });
  });

  it("atividade DONE: 409 com a frase própria", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "3" }));
    expect(response.status).toBe(409);
    expect(await read(response)).toMatchObject({ error: "Esta atividade já foi concluída" });
  });

  it("trava DEC-99: 2 tarefas abertas são 400 dizendo quantas", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "4" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({
      error: "Conclua as 2 tarefas da atividade antes de solicitar a conclusão",
    });
  });

  it("prova ausente: 400 com a frase da DEC-162", async () => {
    login(["VOLUNTARIO"], 2);
    // Atividade 4 tem tarefas abertas; para isolar a prova, zera a trava e limpa as provas dela.
    mocks.openTasks.set(4, 0);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "4" }));
    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({
      error: "Anexe pelo menos uma prova antes de solicitar a conclusão",
    });
  });

  it("COORDENADOR global sem membership não solicita (ele aprova, DEC-77)", async () => {
    login(["COORDENADOR"], 1);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "10", activityId: "1" }));
    expect(response.status).toBe(403);
    expect(mocks.requestWrites).toHaveLength(0);
  });

  it("id sem forma: 400 de rota", async () => {
    login(["VOLUNTARIO"], 2);
    const response = await REQUEST_COMPLETION(postRequest("/x"), context({ id: "abc", activityId: "1" }));
    expect(response.status).toBe(400);
  });
});
