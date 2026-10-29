import { beforeEach, describe, expect, it, vi } from "vitest"

// V5-1 (DEC-101) — adapter do port de blobs sobre o seam lib (gotcha A11: o teste mocka a
// lib, não o builtin). Nenhum cliente S3 é construído aqui.

const libMock = vi.hoisted(() => ({
  blobStoreConfigFromEnv: vi.fn(),
  createS3BlobStore: vi.fn(),
}))

vi.mock("@/lib/storage/blob-store", () => libMock)

import { S3BlobStoreAdapter, createS3BlobStorePort } from "@/backend/modules/project-management/infrastructure/adapters/s3-blob-store"
import type { BlobStore } from "@/lib/storage/blob-store"

const CONFIG = {
  endpoint: "http://seaweedfs:8333",
  region: "us-east-1",
  accessKeyId: "app",
  secretAccessKey: "s3cr3t",
  bucket: "displayquest",
  forcePathStyle: true,
}

function fakeStore(): BlobStore {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    head: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  libMock.blobStoreConfigFromEnv.mockReset()
  libMock.createS3BlobStore.mockReset()
})

describe("createS3BlobStorePort", () => {
  it("recusa ligar sem bucket configurado, nomeando as variáveis", () => {
    libMock.blobStoreConfigFromEnv.mockReturnValue(null)

    expect(() => createS3BlobStorePort({ env: {} })).toThrow(/S3_ENDPOINT/)
    expect(libMock.createS3BlobStore).not.toHaveBeenCalled()
  })

  it("cria o store da lib a partir do ambiente e delega as quatro operações", async () => {
    libMock.blobStoreConfigFromEnv.mockReturnValue(CONFIG)
    const store = fakeStore()
    libMock.createS3BlobStore.mockReturnValue(store)

    const port = createS3BlobStorePort({ env: { S3_BUCKET: "displayquest" } })
    expect(libMock.createS3BlobStore).toHaveBeenCalledWith(CONFIG)

    await port.put({ key: "projects/1/logo.png", body: new Uint8Array([1]), contentType: "image/png" })
    expect(store.put).toHaveBeenCalledWith("projects/1/logo.png", new Uint8Array([1]), "image/png")

    await port.get("projects/1/logo.png")
    expect(store.get).toHaveBeenCalledWith("projects/1/logo.png")

    await port.head("projects/1/logo.png")
    expect(store.head).toHaveBeenCalledWith("projects/1/logo.png")

    await port.remove("projects/1/logo.png")
    expect(store.remove).toHaveBeenCalledWith("projects/1/logo.png")
  })

  it("aceita um store pronto (seam de teste) sem tocar a lib", () => {
    const store = fakeStore()

    const port = createS3BlobStorePort({ store })

    expect(port).toBeInstanceOf(S3BlobStoreAdapter)
    expect(libMock.blobStoreConfigFromEnv).not.toHaveBeenCalled()
    expect(libMock.createS3BlobStore).not.toHaveBeenCalled()
  })

  it("prefere a config explícita ao ambiente", () => {
    const store = fakeStore()
    libMock.createS3BlobStore.mockReturnValue(store)

    createS3BlobStorePort({ config: CONFIG })

    expect(libMock.blobStoreConfigFromEnv).not.toHaveBeenCalled()
    expect(libMock.createS3BlobStore).toHaveBeenCalledWith(CONFIG)
  })
})
