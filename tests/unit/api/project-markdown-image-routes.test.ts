// @vitest-environment node
/**
 * S07 (plan-v21, R11/DEC-262) — rotas de imagem na descrição do projeto.
 *
 * O módulo é REAL sobre portas falsas (lição do B6-2a). Só a INSTÂNCIA do bucket é trocada:
 * allowlist, teto, magic bytes seguem os de produção. O que este arquivo congela:
 *   1. A ordem 401 → 404 → gate → corpo. O gate R9 (gestão da ACL OU membro ATIVO, DEC-261)
 *      corre ANTES de `request.formData()` — sem isso, quem não pode empurra bytes ao bucket
 *      e só depois é recusado (DEC-133).
 *   2. Só imagem passa: PDF é blob válido do bucket e não é imagem de descrição.
 *   3. A chave é `projects/<id>/markdown-images/<uuid>.<ext>`; o registro não existe, e
 *      nenhum objeto é escrito quando a autorização recusa.
 *   4. A leitura do binário é aberta ao autenticado (a descrição é leitura aberta, DEC-127),
 *      com `Cache-Control: private` e 404 para chave ausente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type { Role } from "@/backend/domain"
import type { ProjectActorsPort } from "@/backend/modules/project-management/application/ports/project-actors.port"
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
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  bucketConfigured: true,
  gateCalls: [] as string[],
  formDataCalls: [] as string[],
}))

// Atores do cenário (mesma família do teste de anexos, S02):
// 1: COORDENADOR sem membership -> gerencia pelo papel global.
// 3: membership GERENTE_PROJETO -> gerencia.
// 4: sem membership -> 403.
// 5: membership COLABORADOR INATIVA -> 403 (DEC-261: a situação decide).
// 6: membership COLABORADOR ATIVA -> pode escrever a descrição.
const ACTOR_ROLES: Record<number, string[]> = {
  1: ["COORDENADOR"],
  3: ["VOLUNTARIO"],
  4: ["COLABORADOR"],
  5: ["COLABORADOR"],
  6: ["COLABORADOR"],
}
const MEMBERSHIPS: Record<string, { id: number; roles: Role[] }> = {
  "10:3": { id: 30, roles: ["GERENTE_PROJETO"] },
  "10:5": { id: 50, roles: ["COLABORADOR"] },
  "10:6": { id: 60, roles: ["COLABORADOR"] },
}
const ACTIVE_MEMBERSHIPS = new Set(["10:6"])

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
    async findActiveMembership(projectId, userId) {
      return ACTIVE_MEMBERSHIPS.has(`${projectId}:${userId}`) ? { id: 60, roles: ["COLABORADOR"] } : null
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

  return {
    getBackendComposition: () => {
      const projectManagement = createProjectManagementModule({ ports: { projects, memberships, actors } })
      // INV1 (lição medida da S02): o gate de upload corre ANTES de `request.formData()`.
      const assertGate = projectManagement.assertCanUpdateProjectDescription
      // O registro acontece DEPOIS do gate autorizar: `gateCalls` prova a ordem nos casos que
      // passam, e fica vazio nos que recusam — o 404 do projeto e o 403 do gate nunca completam.
      ;(projectManagement as unknown as Record<string, unknown>).assertCanUpdateProjectDescription = async (cmd: { projectId: number; actorId: number }) => {
        await assertGate(cmd)
        mocks.gateCalls.push("gate")
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
      mocks.objects.delete(key)
    },
  }
  return { ...actual, blobStoreFromEnv: () => (mocks.bucketConfigured ? store : null) }
})

import { POST as UPLOAD_MARKDOWN_IMAGE } from "@/app/api/projects/[id]/markdown-images/route"
import { GET as GET_MARKDOWN_IMAGE_FILE } from "@/app/api/projects/[id]/markdown-images/[name]/route"

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// PNG real 2×2 — o `sharp` e o magic exigem imagem inteira nos casos de passagem.
const REAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00, 0x44, 0x7d, 0x7c,
  0x71, 0x00, 0x00, 0x00, 0x1b, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff,
  0x07, 0x9c, 0x21, 0x10, 0x80, 0x8f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc8, 0x00,
  0x18, 0x03, 0x01, 0x00, 0x37, 0xe7, 0x09, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0xb6, 0x60, 0x82,
])
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))])

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function uploadRequest(file: File, path = "/api/projects/10/markdown-images") {
  const form = new FormData()
  form.set("file", file)
  const request = new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", body: form })
  const original = request.formData.bind(request)
  request.formData = async () => {
    mocks.formDataCalls.push("formData")
    return original()
  }
  return request
}

const read = async (response: Response) => await response.json()

beforeEach(() => {
  mocks.session = null
  mocks.projects = new Map<number, ProjectRecord>([[10, projectRow(10)], [20, projectRow(20)]])
  mocks.objects = new Map()
  mocks.puts = []
  mocks.bucketConfigured = true
  mocks.gateCalls = []
  mocks.formDataCalls = []
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/projects/[id]/markdown-images", () => {
  it("sem sessão responde 401", async () => {
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(401)
  })

  it("projeto inexistente responde 404 antes do gate", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" }), "/api/projects/99/markdown-images"),
      context({ id: "99" }),
    )
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Projeto não encontrado")
    expect(mocks.gateCalls).toEqual([])
    expect(mocks.formDataCalls).toEqual([])
    expect(mocks.puts).toEqual([])
  })

  it("não-gestão não-membro responde 403 ANTES de ler o corpo", async () => {
    login(["COLABORADOR"], 4)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(403)
    expect((await read(response)).error).toBe("Usuário não tem permissão para gerenciar este projeto")
    expect(mocks.formDataCalls).toEqual([])
    expect(mocks.puts).toEqual([])
  })

  it("membro INATIVO responde 403 (a situação decide, DEC-261)", async () => {
    login(["COLABORADOR"], 5)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(403)
    expect(mocks.puts).toEqual([])
  })

  it("membro ATIVO sobe a imagem, e a chave é da família markdown-images", async () => {
    login(["COLABORADOR"], 6)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "fluxo.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.name).toBe("fluxo.png")
    expect(body.key).toMatch(/^projects\/10\/markdown-images\/[0-9a-f-]{36}\.png$/)
    expect(body.url).toBe(`/api/projects/10/markdown-images/${body.key.split("/").pop()}?v=${body.key}`)
    expect(mocks.puts).toHaveLength(1)
    expect(mocks.puts[0].bytes).toBe(REAL_PNG.byteLength)
    // A ordem medida: gate, depois corpo, depois bucket.
    expect(mocks.formDataCalls).toEqual(["formData"])
  })

  it("gestão da ACL sobe a imagem", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(200)
    expect(mocks.puts).toHaveLength(1)
  })

  it("sem arquivo responde 400 depois do gate", async () => {
    login(["COORDENADOR"], 1)
    const form = new FormData()
    const request = new NextRequest(new URL("/api/projects/10/markdown-images", "http://localhost:3000"), {
      method: "POST",
      body: form,
    })
    const response = await UPLOAD_MARKDOWN_IMAGE(request, context({ id: "10" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Arquivo é obrigatório")
    expect(mocks.gateCalls).toEqual(["gate"])
  })

  it("PDF é recusado: só imagem entra na descrição", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([PDF_BYTES], "manual.pdf", { type: "application/pdf" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Apenas imagem na descrição")
    expect(mocks.puts).toEqual([])
  })

  it("PNG declarado como JPEG é recusado pela assinatura", async () => {
    login(["COORDENADOR"], 1)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([PNG_SIGNATURE], "x.jpg", { type: "image/jpeg" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(400)
    expect(mocks.puts).toEqual([])
  })

  it("acima de 5 MB é recusado pelo teto do seam", async () => {
    login(["COORDENADOR"], 1)
    const big = new Uint8Array(5 * 1024 * 1024 + 1).fill(0)
    big.set(PNG_SIGNATURE)
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([big], "big.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(400)
    expect(mocks.puts).toEqual([])
  })

  it("sem bucket configurado responde 503, e nenhum objeto existe", async () => {
    login(["COORDENADOR"], 1)
    mocks.bucketConfigured = false
    const response = await UPLOAD_MARKDOWN_IMAGE(
      uploadRequest(new File([REAL_PNG], "capa.png", { type: "image/png" })),
      context({ id: "10" }),
    )
    expect(response.status).toBe(503)
    expect(mocks.objects.size).toBe(0)
  })
})

describe("GET /api/projects/[id]/markdown-images/[name]", () => {
  it("sem sessão responde 401", async () => {
    const response = await GET_MARKDOWN_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "10", name: "abc.png" }))
    expect(response.status).toBe(401)
  })

  it("qualquer autenticado lê o binário (a descrição é leitura aberta)", async () => {
    login(["COLABORADOR"], 4)
    const key = "projects/10/markdown-images/11111111-2222-3333-4444-555555555555.png"
    mocks.objects.set(key, { body: REAL_PNG, contentType: "image/png" })
    const response = await GET_MARKDOWN_IMAGE_FILE(
      new Request("http://localhost:3000/x"),
      context({ id: "10", name: "11111111-2222-3333-4444-555555555555.png" }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(REAL_PNG)
  })

  it("chave ausente no bucket responde 404", async () => {
    login(["COORDENADOR"], 1)
    const response = await GET_MARKDOWN_IMAGE_FILE(
      new Request("http://localhost:3000/x"),
      context({ id: "10", name: "99999999-2222-3333-4444-555555555555.png" }),
    )
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Imagem não encontrada")
  })

  it("nome fora da forma (traversal, .pdf) responde 400 e nada é lido", async () => {
    login(["COORDENADOR"], 1)
    for (const name of ["..%2F..%2Fsecret.png", "x.pdf", "x.Png", "notauuid.png"]) {
      const response = await GET_MARKDOWN_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "10", name }))
      expect(response.status).toBe(400)
    }
    expect(mocks.objects.size).toBe(0)
  })

  it("projeto inexistente responde 404 antes de tocar o bucket", async () => {
    login(["COORDENADOR"], 1)
    const response = await GET_MARKDOWN_IMAGE_FILE(
      new Request("http://localhost:3000/x"),
      context({ id: "99", name: "11111111-2222-3333-4444-555555555555.png" }),
    )
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Projeto não encontrado")
  })
})
