// @vitest-environment node
/**
 * plan-v14 S02 — upload do avatar pelo editor quadrado chega ao bucket.
 *
 * Medido no docker em 2026-11-04: o editor quadrado do perfil sobe pelo mesmo caminho da capa
 * (`PUT /api/users/<id>/images/avatar` com multipart), grava o WebP novo e troca a chave. Este
 * arquivo congela o percurso da rota com o SLOT `avatar` (a lista fechada do domínio), na mesma
 * postura dos arquivos de rota do V5-3: módulo REAL sobre porta falsa (lição do B6-2a), só a
 * INSTÂNCIA do bucket trocada — allowlist, teto, magic bytes, conversão e montagem de chave
 * seguem os de produção.
 *
 * Congela:
 *   1. 401 → 400 (id/slot) → 403 → 400 (corpo), com o gate ANTES de qualquer byte escrito.
 *   2. Slot fora da lista fechada (`avatar`/`banner`) responde com a mensagem do domínio.
 *   3. Upload do self: chave nova no prefixo `users/<id>/images/avatar`, ContentType WebP,
 *      objeto anterior removido, `avatarKey` no registro.
 *   4. Terceiro sem `MANAGE_USERS`: 403 e ZERO objetos escritos.
 *   5. PDF: 400 do seam, nenhum objeto criado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { emptyPersonData, USER_IMAGE_SLOT_MESSAGE } from "@/backend/domain"
import { createUserManagementModule } from "@/backend/modules/user-management"
import type { UserRecord } from "@/backend/modules/user-management/application/ports/user.repository"
import type { BlobStore } from "@/lib/storage/blob-store"
import { REAL_PNG_BYTES } from "@/tests/mocks/fixtures/image-bytes"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  users: new Map<number, UserRecord>(),
  objects: new Map<string, { body: Uint8Array; contentType: string }>(),
  puts: [] as Array<{ key: string; contentType: string; bytes: number }>,
  removes: [] as string[],
  bucketConfigured: true,
}))

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
    avatarKey: `users/${id}/images/avatar/velho.webp`,
    bannerKey: null,
    ...emptyPersonData(),
    roles: ["VOLUNTARIO"],
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  }
}

function notUsed(name: string) {
  return async () => {
    throw new Error(`porta não deveria ser exercitada por este arquivo: ${name}`)
  }
}

vi.mock("@/backend/composition/root", () => {
  const repository = {
    async findById(id: number) {
      const row = mocks.users.get(id)
      return row ? { ...row } : null
    },
    async update(record: UserRecord) {
      mocks.users.set(record.id, record)
      return record
    },
    findByEmail: notUsed("users.findByEmail"),
    create: notUsed("users.create"),
    delete: notUsed("users.delete"),
    findPending: notUsed("users.findPending"),
    findActiveUsers: notUsed("users.findActiveUsers"),
    findTopByPoints: notUsed("users.findTopByPoints"),
    findTopByTasks: notUsed("users.findTopByTasks"),
    findAll: notUsed("users.findAll"),
  }

  return {
    getBackendComposition: () => ({
      userManagement: createUserManagementModule({ repository: repository as never }),
    }),
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
      mocks.removes.push(key)
      mocks.objects.delete(key)
    },
  }
  return { ...actual, blobStoreFromEnv: () => (mocks.bucketConfigured ? store : null) }
})

import { PUT } from "@/app/api/users/[id]/images/[slot]/route"

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

function uploadRequest(bytes: Uint8Array<ArrayBuffer>, type: string, userId = 7, slot = "avatar") {
  const form = new FormData()
  form.append("file", new File([bytes], "avatar.bin", { type }))
  return new NextRequest(new URL(`/api/users/${userId}/images/${slot}`, "http://localhost:3000"), {
    method: "PUT",
    body: form,
  })
}

const PDF_BYTES = new Uint8Array(Array.from("%PDF-1.7\n").map((c) => c.charCodeAt(0)))
const PNG_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array(REAL_PNG_BYTES).slice()

beforeEach(() => {
  mocks.session = null
  mocks.users = new Map<number, UserRecord>([[7, userRow(7)], [9, userRow(9)]])
  mocks.objects = new Map()
  mocks.puts = []
  mocks.removes = []
  mocks.bucketConfigured = true
})

describe("plan-v14 S02 — PUT /api/users/<id>/images/avatar", () => {
  it("anon: 401, nenhum byte ao bucket", async () => {
    const response = await PUT(uploadRequest(PNG_BYTES, "image/png"), context({ id: "7", slot: "avatar" }))
    expect(response.status).toBe(401)
    expect(mocks.puts).toHaveLength(0)
  })

  it("slot fora da lista fechada: 400 com a mensagem do domínio, sem byte escrito", async () => {
    login(["COORDENADOR"], 7)
    const response = await PUT(uploadRequest(PNG_BYTES, "image/png", 7, "capa"), context({ id: "7", slot: "capa" }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(USER_IMAGE_SLOT_MESSAGE)
    expect(mocks.puts).toHaveLength(0)
  })

  it("upload do self: chave nova no prefixo do avatar, WebP, objeto velho removido", async () => {
    login(["VOLUNTARIO"], 7)
    const response = await PUT(uploadRequest(PNG_BYTES, "image/png"), context({ id: "7", slot: "avatar" }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user.avatarKey).toMatch(/^users\/7\/images\/avatar\/.+\.webp$/)
    expect(mocks.puts).toHaveLength(1)
    expect(mocks.puts[0].contentType).toBe("image/webp")
    expect(mocks.removes).toContain("users/7/images/avatar/velho.webp")
    expect(mocks.users.get(7)?.avatarKey).toBe(body.user.avatarKey)
  })

  it("terceiro sem MANAGE_USERS: 403 antes de qualquer byte", async () => {
    login(["VOLUNTARIO"], 9)
    const response = await PUT(uploadRequest(PNG_BYTES, "image/png", 7), context({ id: "7", slot: "avatar" }))
    expect(response.status).toBe(403)
    expect(mocks.puts).toHaveLength(0)
    expect(mocks.users.get(7)?.avatarKey).toBe("users/7/images/avatar/velho.webp")
  })

  it("PDF: 400 do seam, nenhum objeto criado", async () => {
    login(["VOLUNTARIO"], 7)
    const response = await PUT(uploadRequest(PDF_BYTES, "application/pdf"), context({ id: "7", slot: "avatar" }))
    expect(response.status).toBe(400)
    expect(mocks.puts).toHaveLength(0)
    expect(mocks.users.get(7)?.avatarKey).toBe("users/7/images/avatar/velho.webp")
  })
})
