// @vitest-environment node
/**
 * S08 (plan-v21, R12/R13, DEC-263) — rotas de imagem da bio do usuário.
 *
 * Mesma régua de R11 (S07), aplicada a `users`: o gate é a autoridade do perfil — SELF OU
 * `MANAGE_USERS` (DEC-137) — e corre ANTES de `request.formData()` (DEC-133). A chave é
 * `users/<id>/markdown-images/<uuid>.<ext>`. O binário é leitura aberta ao autenticado, como
 * a bio na tela de perfil. O módulo é REAL sobre portas falsas (lição do B6-2a).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import type { ActorRef } from "@/backend/domain"
import { createUserManagementModule } from "@/backend/modules/user-management"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  users: new Map<number, { id: number; roles: string[]; profileVisibility: string; status: string }>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  bucketConfigured: true,
  gateCalls: [] as string[],
  formDataCalls: [] as string[],
}))

// Atores: 1 = dono da bio; 2 = gestão MANAGE_USERS; 3 = terceiro sem nada.
const ACTOR_ROLES: Record<number, string[]> = { 1: ["VOLUNTARIO"], 2: ["GERENTE"], 3: ["VOLUNTARIO"] }

vi.mock("@/backend/composition/root", () => {
  const repository = {
    async findById(id: number) {
      const row = mocks.users.get(id)
      return row ? { ...row } : null
    },
  } as never

  return {
    getBackendComposition: () => {
      const userManagement = createUserManagementModule({ repository })
      // O registro acontece DEPOIS do gate autorizar (mesma costura do teste de S07).
      const assertGate = userManagement.assertCanUpdateUserBio
      ;(userManagement as unknown as Record<string, unknown>).assertCanUpdateUserBio = async (cmd: { actor: ActorRef; userId: number }) => {
        await assertGate(cmd)
        mocks.gateCalls.push("gate")
      }
      return { userManagement }
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
  const store = {
    async put(key: string, body: Uint8Array, contentType: string) {
      mocks.puts.push({ key, contentType, bytes: body.byteLength })
      mocks.objects.set(key, { body, contentType })
    },
    async get(key: string) {
      const object = mocks.objects.get(key)
      if (!object) return null
      return { key, size: object.body.byteLength, contentType: object.contentType, body: object.body }
    },
    async head(key: string) {
      const object = mocks.objects.get(key)
      if (!object) return null
      return { key, size: object.body.byteLength, contentType: object.contentType }
    },
    async remove(key: string) {
      mocks.objects.delete(key)
    },
  }
  return { ...actual, blobStoreFromEnv: () => (mocks.bucketConfigured ? store : null) }
})

import { POST as UPLOAD_BIO_IMAGE } from "@/app/api/users/[id]/markdown-images/route"
import { GET as GET_BIO_IMAGE_FILE } from "@/app/api/users/[id]/markdown-images/[name]/route"

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

function uploadRequest(file: File, path = "/api/users/1/markdown-images") {
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
  mocks.users = new Map<number, { id: number; roles: string[]; profileVisibility: string; status: string }>([
    [1, { id: 1, roles: ["VOLUNTARIO"], profileVisibility: "public", status: "active" }],
    [2, { id: 2, roles: ["GERENTE"], profileVisibility: "public", status: "active" }],
    [3, { id: 3, roles: ["VOLUNTARIO"], profileVisibility: "public", status: "active" }],
  ])
  mocks.objects = new Map()
  mocks.puts = []
  mocks.bucketConfigured = true
  mocks.gateCalls = []
  mocks.formDataCalls = []
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/users/[id]/markdown-images", () => {
  it("sem sessão responde 401", async () => {
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(401)
    expect(mocks.gateCalls).toEqual([])
  })

  it("id inválido responde 400 antes do gate", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" }), "/api/users/0/markdown-images"), context({ id: "0" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Usuário inválido")
    expect(mocks.gateCalls).toEqual([])
  })

  it("usuário inexistente responde 404 antes de ler o corpo", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" }), "/api/users/99/markdown-images"), context({ id: "99" }))
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Usuário não encontrado")
    expect(mocks.formDataCalls).toEqual([])
    expect(mocks.puts).toEqual([])
  })

  it("terceiro sem gestão responde 403 ANTES de ler o corpo", async () => {
    login(["VOLUNTARIO"], 3)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(403)
    expect((await read(response)).error).toBe("Não autorizado")
    expect(mocks.formDataCalls).toEqual([])
    expect(mocks.puts).toEqual([])
  })

  it("o dono sobe a imagem na família markdown-images do usuário", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "rosto.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.name).toBe("rosto.png")
    expect(body.key).toMatch(/^users\/1\/markdown-images\/[0-9a-f-]{36}\.png$/)
    expect(body.url).toBe(`/api/users/1/markdown-images/${body.key.split("/").pop()}?v=${body.key}`)
    expect(mocks.gateCalls).toEqual(["gate"])
    expect(mocks.formDataCalls).toEqual(["formData"])
    expect(mocks.puts).toHaveLength(1)
  })

  it("gestão MANAGE_USERS sobe a imagem na bio de terceiro", async () => {
    login(["GERENTE"], 2)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(200)
    expect(mocks.puts[0].key.startsWith("users/1/markdown-images/")).toBe(true)
  })

  it("sem arquivo responde 400 depois do gate", async () => {
    login(["VOLUNTARIO"], 1)
    const request = new NextRequest(new URL("/api/users/1/markdown-images", "http://localhost:3000"), { method: "POST", body: new FormData() })
    const response = await UPLOAD_BIO_IMAGE(request, context({ id: "1" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Arquivo é obrigatório")
    expect(mocks.gateCalls).toEqual(["gate"])
  })

  it("PDF é recusado: só imagem entra na bio", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([PDF_BYTES], "x.pdf", { type: "application/pdf" })), context({ id: "1" }))
    expect(response.status).toBe(400)
    expect((await read(response)).error).toBe("Apenas imagem na descrição")
    expect(mocks.puts).toEqual([])
  })

  it("acima de 5 MB é recusado pelo teto do seam", async () => {
    login(["VOLUNTARIO"], 1)
    const big = new Uint8Array(5 * 1024 * 1024 + 1).fill(0)
    big.set(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([big], "big.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(400)
    expect(mocks.puts).toEqual([])
  })

  it("sem bucket configurado responde 503, e nenhum objeto existe", async () => {
    login(["VOLUNTARIO"], 1)
    mocks.bucketConfigured = false
    const response = await UPLOAD_BIO_IMAGE(uploadRequest(new File([REAL_PNG], "x.png", { type: "image/png" })), context({ id: "1" }))
    expect(response.status).toBe(503)
    expect(mocks.objects.size).toBe(0)
  })
})

describe("GET /api/users/[id]/markdown-images/[name]", () => {
  it("terceiro autenticado lê o binário (a bio é leitura aberta)", async () => {
    login(["VOLUNTARIO"], 3)
    const key = "users/1/markdown-images/11111111-2222-3333-4444-555555555555.png"
    mocks.objects.set(key, { body: REAL_PNG, contentType: "image/png" })
    const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "1", name: "11111111-2222-3333-4444-555555555555.png" }))
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=86400")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(REAL_PNG)
  })

  it("perfil privado: o terceiro recebe 403, e nenhum byte sai", async () => {
    login(["VOLUNTARIO"], 3)
    mocks.users.get(1)!.profileVisibility = "private"
    const key = "users/1/markdown-images/11111111-2222-3333-4444-555555555555.png"
    mocks.objects.set(key, { body: REAL_PNG, contentType: "image/png" })
    const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "1", name: "11111111-2222-3333-4444-555555555555.png" }))
    expect(response.status).toBe(403)
  })


  it("sem sessão responde 401", async () => {
    const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "1", name: "11111111-2222-3333-4444-555555555555.png" }))
    expect(response.status).toBe(401)
  })

  it("nome fora da forma responde 400, e nada é lido", async () => {
    login(["VOLUNTARIO"], 1)
    for (const name of ["..%2Fsecret.png", "x.pdf", "notauuid.png"]) {
      const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "1", name }))
      expect(response.status).toBe(400)
    }
    expect(mocks.objects.size).toBe(0)
  })

  it("chave ausente no bucket responde 404", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "1", name: "99999999-2222-3333-4444-555555555555.png" }))
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Imagem não encontrada")
  })

  it("usuário inexistente responde 404 antes de tocar o bucket", async () => {
    login(["VOLUNTARIO"], 1)
    const response = await GET_BIO_IMAGE_FILE(new Request("http://localhost:3000/x"), context({ id: "99", name: "11111111-2222-3333-4444-555555555555.png" }))
    expect(response.status).toBe(404)
    expect((await read(response)).error).toBe("Usuário não encontrado")
  })
})
