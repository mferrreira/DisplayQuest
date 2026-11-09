// @vitest-environment node
/**
 * S02 (plan-v21) — rotas de arquivos de entregável.
 *
 * Mesma costura de `project-files-routes.test.ts` (lições congeladas lá, repetidas aqui de
 * propósito porque a regra nova tem caminhos novos):
 *   - O módulo é REAL sobre portas falsas (um duplo que devolve o módulo inteiro faz o 403 sumir
 *     do teste em vez de falhar — B6-2a).
 *   - A ordem 401 → 404 → 403 → 400, e em upload o 403 vem ANTES de o corpo ser lido: sem isso,
 *     quem não gerencia empurra bytes ao bucket e só depois é recusado (DEC-54).
 *   - Tipo/tamanho/assinatura são do seam, não da rota.
 *   - O objeto é removido quando o registro falha depois do put (compensação).
 *   - id de entregável/arquivo de OUTRO projeto responde 404, não "achei e servi".
 *
 * O que é novo aqui e congela:
 *   1. A leitura dos arquivos é aberta ao autenticado (DEC-136 — o voluntário vê e abre o GDD).
 *   2. A chave do bucket é `projects/<projeto>/deliverables/<entregável>/files/...`.
 *   3. A rota de arquivo serve o byte com `filename*=UTF-8''` e cache privado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type { Role } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
import type {
  ProjectDeliverableRecord,
  ProjectDeliverablesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverables.repository"
import type {
  ProjectDeliverableFileRecord,
  ProjectDeliverableFilesPort,
} from "@/backend/modules/project-management/application/ports/project-deliverable-files.repository"
import type {
  ProjectManagementMembershipPort,
} from "@/backend/modules/project-management/application/ports/project-membership.repository"
import type {
  ProjectRecord,
  ProjectRepositoryPort,
} from "@/backend/modules/project-management/application/ports/project.repository"
import type { BlobStore } from "@/lib/storage/blob-store"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  projects: new Map<number, ProjectRecord>(),
  deliverables: [] as ProjectDeliverableRecord[],
  files: [] as ProjectDeliverableFileRecord[],
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  failFileCreate: false,
  bucketConfigured: true,
  gateCalls: [] as string[],
  order: [] as string[],
  nextId: 100,
}))

// Atores do cenário, mesmos papéis medidos do lote de anexos:
// 1: COORDENADOR sem membership -> gerencia pelo papel global.
// 2: líder do projeto sem membership -> acessa, NÃO gerencia.
// 3: membership GERENTE_PROJETO -> gerencia.
// 4: VOLUNTARIO sem nada -> 403 em escrita, leitura aberta.
// 5: membership COLABORADOR -> acessa, não gerencia.
const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  2: ["VOLUNTARIO"],
  3: ["VOLUNTARIO"],
  4: ["VOLUNTARIO"],
  5: ["VOLUNTARIO"],
}
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
  "10:5": { id: 50, roles: ["COLABORADOR"] },
}

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
  }
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`)
  }
}

vi.mock("@/backend/composition/root", () => {
  const projects: ProjectRepositoryPort = {
    findAll: notUsed("projects.findAll"),
    findByLeaderId: notUsed("projects.findByLeaderId"),
    async findById(id) {
      return mocks.projects.get(id) ?? null
    },
    create: notUsed("projects.create"),
    createWithCronograma: notUsed("projects.createWithCronograma"),
    update: notUsed("projects.update"),
    delete: notUsed("projects.delete"),
    incrementPoints: notUsed("projects.incrementPoints"),
  }

  const memberships: ProjectManagementMembershipPort = {
    async findMembership(projectId, userId) {
      return MEMBERSHIPS[`${projectId}:${userId}`] ?? null
    },
    createMembership: notUsed("memberships.createMembership"),
    updateMembershipRoles: notUsed("memberships.updateMembershipRoles"),
    listMembersWithUser: notUsed("memberships.listMembersWithUser"),
    listActiveMemberUserIds: notUsed("memberships.listActiveMemberUserIds"),
  }

  const actors: ProjectActorsPort = {
    async findActor(userId) {
      const roles = ACTOR_ROLES[userId]
      return roles ? { id: userId, roles } : null
    },
  }

  const deliverables: ProjectDeliverablesPort = {
    async listByProjectId(projectId) {
      return mocks.deliverables.filter((row) => row.projectId === projectId)
    },
    async findById(id) {
      return mocks.deliverables.find((row) => row.id === id) ?? null
    },
    create: notUsed("deliverables.create"),
    update: notUsed("deliverables.update"),
    delete: notUsed("deliverables.delete"),
  }

  const projectDeliverableFiles: ProjectDeliverableFilesPort = {
    async listByDeliverable(deliverableId) {
      return mocks.files.filter((row) => row.deliverableId === deliverableId)
    },
    async findById(id) {
      return mocks.files.find((row) => row.id === id) ?? null
    },
    async create(input) {
      if (mocks.failFileCreate) {
        throw new Error("falha simulada do banco ao gravar o arquivo de entregável")
      }
      const row: ProjectDeliverableFileRecord = {
        id: ++mocks.nextId,
        deliverableId: input.deliverableId,
        blobKey: input.blobKey,
        name: input.name,
        contentType: input.contentType,
        size: input.size,
        uploadedBy: input.uploadedBy,
        uploadedAt: "2026-11-09T12:00:00.000Z",
      }
      mocks.files.push(row)
      return row
    },
    async countByDeliverable(deliverableId) {
      return mocks.files.filter((row) => row.deliverableId === deliverableId).length
    },
    async delete(fileId) {
      const index = mocks.files.findIndex((row) => row.id === fileId)
      if (index === -1) return null
      const row = mocks.files[index]
      mocks.files.splice(index, 1)
      mocks.order.push("record")
      return row
    },
  }

  return {
    getBackendComposition: () => {
      const projectManagement = createProjectManagementModule({
        ports: { projects, memberships, actors, deliverables, projectDeliverableFiles },
      })
      // INV1 medida pelo juiz: o gate tem que correr ANTES de `request.formData()`. O invólucro
      // registra o gate; o teste espião `formData` na request. A asserção é a ordem, não o put.
      const assertGate = projectManagement.assertCanManageProject
      ;(projectManagement as { assertCanManageProject: (cmd: { projectId: number; actorId: number }) => Promise<unknown> }).assertCanManageProject = async (cmd) => {
        mocks.gateCalls.push("gate")
        mocks.order.push("gate")
        return assertGate(cmd)
      }
      return {
        identityAccess: createIdentityAccessModule(),
        projectManagement,
      }
    },
  }
})

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? {
          user: null,
          error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }),
        }
      : { user: mocks.session },
}))

// Só a INSTÂNCIA do bucket é trocada: allowlist, teto, magic bytes e montagem de chave seguem
// os de produção — é neles que este arquivo bate.
vi.mock("@/lib/storage/blob-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/blob-store")>()
  const store: BlobStore = {
    async put(key, body, contentType) {
      mocks.puts.push({ key, contentType, bytes: body.byteLength })
      mocks.objects.set(key, { body, contentType })
    },
    async get(key) {
      const object = mocks.objects.get(key)
      if (!object) return null
      return { key, size: object.body.byteLength, contentType: object.contentType, body: object.body }
    },
    async head(key) {
      const object = mocks.objects.get(key)
      if (!object) return null
      return { key, size: object.body.byteLength, contentType: object.contentType }
    },
    async remove(key) {
      mocks.removes.push(key)
      mocks.order.push("bucket")
      mocks.objects.delete(key)
    },
  }
  return { ...actual, blobStoreFromEnv: () => (mocks.bucketConfigured ? store : null) }
})

import { GET as LIST_DELIVERABLE_FILES, POST as UPLOAD_DELIVERABLE_FILE } from "@/app/api/projects/[id]/deliverables/[deliverableId]/files/route"
import { GET as GET_DELIVERABLE_FILE } from "@/app/api/projects/[id]/deliverables/[deliverableId]/files/[fileId]/file/route"
import { DELETE as DELETE_DELIVERABLE_FILE } from "@/app/api/projects/[id]/deliverables/[deliverableId]/files/[fileId]/route"

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))])

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function jsonRequest(method: string, path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers: { "content-type": "application/json" } })
}

function uploadRequest(file: File, path = "/api/projects/10/deliverables/101/files") {
  const form = new FormData()
  form.set("file", file)
  return new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", body: form })
}

const read = async (response: Response) => await response.json()

beforeEach(() => {
  mocks.session = null
  mocks.projects = new Map<number, ProjectRecord>([
    [10, projectRow(10)],
    [20, projectRow(20)],
  ])
  mocks.deliverables = [
    { id: 101, projectId: 10, name: "Relatório parcial", quantity: 1, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
    { id: 102, projectId: 20, name: "Entregável de outro projeto", quantity: 3, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
    { id: 103, projectId: 10, name: "Entregável vizinho", quantity: 1, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
  ]
  mocks.files = [
    {
      id: 301,
      deliverableId: 101,
      blobKey: "projects/10/deliverables/101/files/gdd.pdf",
      name: "GDD.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.byteLength,
      uploadedBy: 1,
      uploadedAt: "2026-10-01T12:00:00.000Z",
    },
  ]
  mocks.objects.clear()
  mocks.objects.set("projects/10/deliverables/101/files/gdd.pdf", { body: PDF_BYTES, contentType: "application/pdf" })
  mocks.puts = []
  mocks.removes = []
  mocks.gateCalls = []
  mocks.order = []
  mocks.failFileCreate = false
  mocks.bucketConfigured = true
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("lista de arquivos do entregável — leitura aberta, id de fora é 404", () => {
  it("sem sessão: 401 antes de tudo", async () => {
    const response = await LIST_DELIVERABLE_FILES(jsonRequest("GET", "/api/projects/10/deliverables/101/files"), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(401)
  })

  it("projeto inexistente: 404", async () => {
    login(["COORDENADOR"], 1)
    const response = await LIST_DELIVERABLE_FILES(jsonRequest("GET", "/api/projects/999/deliverables/101/files"), context({ id: "999", deliverableId: "101" }))
    expect(response.status).toBe(404)
  })

  it("entregável de outro projeto: 404, não lista vazia", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await LIST_DELIVERABLE_FILES(jsonRequest("GET", "/api/projects/10/deliverables/102/files"), context({ id: "10", deliverableId: "102" }))
    expect(response.status).toBe(404)
  })

  it("voluntário lista os arquivos do entregável do projeto (leitura aberta, DEC-136)", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await LIST_DELIVERABLE_FILES(jsonRequest("GET", "/api/projects/10/deliverables/101/files"), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.files).toHaveLength(1)
    expect(body.files[0]).toMatchObject({ id: 301, deliverableId: 101, name: "GDD.pdf", size: PDF_BYTES.byteLength })
    expect(body.files[0].blobKey).toBe("projects/10/deliverables/101/files/gdd.pdf")
  })

  it("ids não numéricos: 400", async () => {
    login(["COORDENADOR"], 1)
    const response = await LIST_DELIVERABLE_FILES(jsonRequest("GET", "/api/projects/10/deliverables/abc/files"), context({ id: "10", deliverableId: "abc" }))
    expect(response.status).toBe(400)
  })
})

describe("upload de arquivo de entregável — gate antes do corpo, seam, bucket, compensação", () => {
  it("voluntário: 403 ANTES de o corpo ser lido, e nenhum byte escrito no bucket", async () => {
    login(["VOLUNTARIO"], 4)
    const request = uploadRequest(new File([PDF_BYTES], "gdd.pdf", { type: "application/pdf" }))
    const formSpy = vi.spyOn(request, "formData")
    const response = await UPLOAD_DELIVERABLE_FILE(request, context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(403)
    // A asserção é a ordem medida, não o efeito colateral: o gate correu, e `formData` NUNCA foi
    // chamada. Movendo o gate para depois da leitura do corpo, este teste fica vermelho.
    expect(mocks.gateCalls).toEqual(["gate"])
    expect(formSpy).not.toHaveBeenCalled()
    expect(mocks.puts).toEqual([])
    expect(mocks.files.filter((row) => row.id > 301)).toEqual([])
  })

  it("líder sem gestão: 403", async () => {
    login(["VOLUNTARIO"], 2)
    const response = await UPLOAD_DELIVERABLE_FILE(uploadRequest(new File([PDF_BYTES], "gdd.pdf", { type: "application/pdf" })), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(403)
    expect(mocks.puts).toEqual([])
  })

  it("gerência do projeto: 201, chave sob o prefixo do entregável, put exatamente uma vez", async () => {
    login(["VOLUNTARIO"], 3)
    const request = uploadRequest(new File([PDF_BYTES], "GDD.pdf", { type: "application/pdf" }))
    const formSpy = vi.spyOn(request, "formData")
    const response = await UPLOAD_DELIVERABLE_FILE(request, context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(201)
    // O gate é a primeira coisa que a rota faz, antes mesmo de ler o corpo.
    expect(mocks.gateCalls).toEqual(["gate"])
    expect(formSpy).toHaveBeenCalledTimes(1)
    const body = await read(response)
    expect(body.file).toMatchObject({
      deliverableId: 101,
      name: "GDD.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.byteLength,
      uploadedBy: 3,
    })
    expect(body.file.blobKey).toMatch(/^projects\/10\/deliverables\/101\/files\//)
    expect(mocks.puts).toHaveLength(1)
    expect(mocks.puts[0].key).toBe(body.file.blobKey)
    expect(mocks.objects.get(body.file.blobKey)).toBeDefined()
  })

  it("PNG declarado como PDF: 400 do seam, nenhum objeto criado, nenhum registro", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_DELIVERABLE_FILE(uploadRequest(new File([PNG_BYTES], "disfarçado.pdf", { type: "application/pdf" })), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(400)
    expect(mocks.puts).toEqual([])
    expect(mocks.files.filter((row) => row.id > 301)).toEqual([])
  })

  it("entregável de outro projeto: 404 e o objeto recém-escrito é removido", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_DELIVERABLE_FILE(uploadRequest(new File([PDF_BYTES], "gdd.pdf", { type: "application/pdf" }), "/api/projects/10/deliverables/102/files"), context({ id: "10", deliverableId: "102" }))
    expect(response.status).toBe(404)
    expect(mocks.puts).toHaveLength(1)
    expect(mocks.removes).toEqual([mocks.puts[0].key])
    expect(mocks.files.filter((row) => row.id > 301)).toEqual([])
  })

  it("registro falha depois do put: o objeto é removido (compensação)", async () => {
    login(["COORDENADOR"], 1)
    mocks.failFileCreate = true
    const response = await UPLOAD_DELIVERABLE_FILE(uploadRequest(new File([PDF_BYTES], "gdd.pdf", { type: "application/pdf" })), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(500)
    expect(mocks.puts).toHaveLength(1)
    expect(mocks.removes).toEqual([mocks.puts[0].key])
  })

  it("bucket não configurado: 503", async () => {
    login(["COORDENADOR"], 1)
    mocks.bucketConfigured = false
    const response = await UPLOAD_DELIVERABLE_FILE(uploadRequest(new File([PDF_BYTES], "gdd.pdf", { type: "application/pdf" })), context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(503)
    expect(mocks.files.filter((row) => row.id > 301)).toEqual([])
  })

  it("sem arquivo no corpo: 400", async () => {
    login(["COORDENADOR"], 1)
    const form = new FormData()
    const request = new NextRequest(new URL("http://localhost:3000/api/projects/10/deliverables/101/files", undefined), { method: "POST", body: form })
    const response = await UPLOAD_DELIVERABLE_FILE(request, context({ id: "10", deliverableId: "101" }))
    expect(response.status).toBe(400)
    expect(mocks.puts).toEqual([])
  })
})

describe("rota que serve o arquivo do entregável — leitura aberta, cache privado", () => {
  it("sem sessão: 401", async () => {
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301/file"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(401)
  })

  it("voluntário abre o arquivo: bytes, tipo, nome em filename*, cache privado", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301/file"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe("inline; filename*=UTF-8''GDD.pdf")
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES)
  })

  it("arquivo de entregável de outro projeto: 404", async () => {
    login(["COORDENADOR"], 1)
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/102/files/301/file"), context({ id: "10", deliverableId: "102", fileId: "301" }))
    expect(response.status).toBe(404)
  })

  it("arquivo de outro entregável no MESMO projeto: 404 (o vínculo file↔entregável é a regra)", async () => {
    login(["COORDENADOR"], 1)
    // 103 é entregável do mesmo projeto 10; o arquivo 301 pertence a 101. Trocando o vínculo
    // `file.deliverableId !== deliverable.id` por "achou o file", este teste fica vermelho.
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/103/files/301/file"), context({ id: "10", deliverableId: "103", fileId: "301" }))
    expect(response.status).toBe(404)
  })

  it("arquivo inexistente: 404", async () => {
    login(["COORDENADOR"], 1)
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/399/file"), context({ id: "10", deliverableId: "101", fileId: "399" }))
    expect(response.status).toBe(404)
  })

  it("objeto sumiu do bucket: 404 com a frase da rota", async () => {
    login(["COORDENADOR"], 1)
    mocks.objects.clear()
    const response = await GET_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301/file"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Arquivo não encontrado")
  })
})

describe("DELETE remove arquivo de entregável — gate, ordem registro-antes-do-objeto, vínculo", () => {
  it("sem sessão: 401, nada sai", async () => {
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(401)
    expect(mocks.files).toHaveLength(1)
    expect(mocks.removes).toEqual([])
  })

  it("voluntário: 403, o registro fica e nada é removido do bucket", async () => {
    login(["VOLUNTARIO"], 4)
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(403)
    expect(mocks.gateCalls).toEqual(["gate"])
    expect(mocks.files).toHaveLength(1)
    expect(mocks.removes).toEqual([])
    expect(mocks.objects.has("projects/10/deliverables/101/files/gdd.pdf")).toBe(true)
  })

  it("gerência remove: 200, o registro sai ANTES do objeto, e o byte sai do bucket", async () => {
    login(["COORDENADOR"], 1)
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.file.id).toBe(301)
    expect(body.file.blobKey).toBe("projects/10/deliverables/101/files/gdd.pdf")
    // A ordem medida é a regra do demo: registro → bucket. removendo o objeto antes do
    // registro, fica ["gate","bucket","record"] e este teste vê vermelho.
    expect(mocks.order).toEqual(["gate", "record", "bucket"])
    expect(mocks.removes).toEqual(["projects/10/deliverables/101/files/gdd.pdf"])
    expect(mocks.files).toEqual([])
    expect(mocks.objects.size).toBe(0)
  })

  it("arquivo de entregável vizinho do MESMO projeto: 404, nada sai", async () => {
    login(["COORDENADOR"], 1)
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/103/files/301"), context({ id: "10", deliverableId: "103", fileId: "301" }))
    expect(response.status).toBe(404)
    expect(mocks.files).toHaveLength(1)
    expect(mocks.removes).toEqual([])
  })

  it("entregável de outro projeto: 404, nada sai", async () => {
    login(["COORDENADOR"], 1)
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/102/files/301"), context({ id: "10", deliverableId: "102", fileId: "301" }))
    expect(response.status).toBe(404)
    expect(mocks.files).toHaveLength(1)
    expect(mocks.removes).toEqual([])
  })

  it("bucket não configurado: 200 com o registro removido, nenhuma remoção de objeto tentada", async () => {
    login(["VOLUNTARIO"], 3)
    mocks.bucketConfigured = false
    const response = await DELETE_DELIVERABLE_FILE(new Request("http://localhost:3000/api/projects/10/deliverables/101/files/301"), context({ id: "10", deliverableId: "101", fileId: "301" }))
    expect(response.status).toBe(200)
    expect(mocks.order).toEqual(["gate", "record"])
    expect(mocks.removes).toEqual([])
    expect(mocks.files).toEqual([])
  })
})
