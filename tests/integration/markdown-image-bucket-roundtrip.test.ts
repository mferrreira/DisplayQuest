// @vitest-environment node
/**
 * S07 (plan-v21, R11/DEC-262) — G4 roundtrip da família de chave `markdown-images` contra o
 * bucket real (SeaweedFS, env `S3_*`) e o banco isolado 5433.
 *
 * A imagem da descrição não tem registro — o binário é o registro. Este arquivo prova contra
 * a INSTÂNCIA do bucket, não contra o fake da rota:
 *   1. `put` na chave `projects/<id>/markdown-images/<uuid>.<ext>` e `get` devolve os bytes.
 *   2. `head` mede o mesmo tamanho — o objeto existe pelo que foi escrito.
 *   3. Chave de outra família (attachment) não colide com a de markdown.
 * Só os objetos criados por este arquivo saem no afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"

import { blobStoreFromEnv } from "@/lib/storage/blob-store"

const REAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x08, 0x06, 0x00, 0x00, 0x00, 0x44, 0x7d, 0x7c,
  0x71, 0x00, 0x00, 0x00, 0x1b, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0xff,
  0x07, 0x9c, 0x21, 0x10, 0x80, 0x8f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc8, 0x00,
  0x18, 0x03, 0x01, 0x00, 0x37, 0xe7, 0x09, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0xb6, 0x60, 0x82,
])

const store = blobStoreFromEnv()
const stamp = Date.now()
const projectId = 999_990 + (stamp % 10)
const keys: string[] = []

describe("G4 roundtrip — imagem da descrição no bucket real", () => {
  beforeAll(() => {
    if (!store) {
      throw new Error("bucket não configurado — exporte S3_* antes de rodar o roundtrip")
    }
  })

  afterAll(async () => {
    for (const key of keys) {
      await store!.remove(key)
    }
  })

  it("put/get na família markdown-images devolve o byte exato", async () => {
    const key = `projects/${projectId}/markdown-images/${randomUUID()}.png`
    keys.push(key)
    await store!.put(key, REAL_PNG, "image/png")
    const object = await store!.get(key)
    expect(object).not.toBeNull()
    expect(new Uint8Array(object!.body)).toEqual(REAL_PNG)
    expect(object!.contentType).toBe("image/png")
    expect(key).toMatch(/^projects\/\d+\/markdown-images\/[0-9a-f-]{36}\.png$/)
  })

  it("head mede o objeto pela escrita, e chave de outra família não colide", async () => {
    const mdKey = `projects/${projectId}/markdown-images/${randomUUID()}.png`
    const attKey = `projects/${projectId}/attachments/${randomUUID()}.png`
    keys.push(mdKey, attKey)
    await store!.put(mdKey, REAL_PNG, "image/png")
    await store!.put(attKey, REAL_PNG, "image/png")
    const head = await store!.head(mdKey)
    expect(head!.size).toBe(REAL_PNG.byteLength)
    const other = await store!.get(attKey)
    expect(other!.key).toBe(attKey)
    expect(mdKey).not.toBe(attKey)
  })
})
