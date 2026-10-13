import { describe, it, expect, vi } from "vitest"

// V5-1 (DEC-101) — seam de blobs em bucket S3-compatible. Regra 12 do plano: nenhum
// blob novo fora do bucket. A suíte roda SEM bucket no ar: o cliente S3 é injetado.

import {
  BLOB_ALLOWED_MIME,
  MAX_BLOB_IMAGE_BYTES,
  MAX_BLOB_PDF_BYTES,
  MAX_BLOB_VIDEO_BYTES,
  blobExtensionFor,
  blobRuleFor,
  blobStoreConfigFromEnv,
  createS3BlobStore,
  isAllowedBlobContentType,
  newBlobKey,
  sanitizeBlobPrefix,
  validateBlobUpload,
  type BlobS3Client,
} from "@/lib/storage/blob-store"
// A tabela de assinatura é peça própria (V5-2c): o seam de relatório e o de bucket consomem
// a mesma, então o teste também a consome direto da fonte, não através do seam.
import { magicMatches } from "@/lib/storage/magic-bytes"

interface CommandView {
  name: string
  input: Record<string, unknown>
}

function commandOf(command: unknown): CommandView {
  const viewed = command as { constructor: { name: string }; input: Record<string, unknown> }
  return { name: viewed.constructor.name, input: viewed.input }
}

const CONFIG = {
  endpoint: "http://seaweedfs:8333",
  region: "us-east-1",
  accessKeyId: "app",
  secretAccessKey: "s3cr3t",
  bucket: "displayquest",
  forcePathStyle: true,
}

describe("allowlist do bucket (DEC-101)", () => {
  it("aceita imagem, PDF e vídeo — os três grupos do plano", () => {
    expect(isAllowedBlobContentType("image/png")).toBe(true)
    expect(isAllowedBlobContentType("image/jpeg")).toBe(true)
    expect(isAllowedBlobContentType("application/pdf")).toBe(true)
    expect(isAllowedBlobContentType("video/mp4")).toBe(true)
    expect(isAllowedBlobContentType("video/webm")).toBe(true)
  })

  it("rejeita tipo fora dos grupos (documento de escritório ainda não entra)", () => {
    expect(isAllowedBlobContentType("application/zip")).toBe(false)
    expect(
      isAllowedBlobContentType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false)
    expect(isAllowedBlobContentType("")).toBe(false)
  })

  it("normaliza parâmetros e caixa do Content-Type antes de decidir", () => {
    expect(isAllowedBlobContentType("IMAGE/PNG")).toBe(true)
    expect(isAllowedBlobContentType("image/jpeg; charset=binary")).toBe(true)
    expect(blobRuleFor("image/webp")?.kind).toBe("image")
    expect(blobRuleFor("video/quicktime")?.kind).toBe("video")
    expect(blobRuleFor("application/pdf")?.kind).toBe("pdf")
  })

  it("publica a allowlist completa para o formulário (8 tipos)", () => {
    expect(BLOB_ALLOWED_MIME).toHaveLength(8)
    expect(blobExtensionFor("image/jpeg")).toBe("jpg")
    expect(blobExtensionFor("desconhecido/tipo")).toBe("bin")
  })
})

describe("validateBlobUpload — allowlist + teto por grupo", () => {
  it("aceita arquivo no limite exato do grupo", () => {
    expect(validateBlobUpload({ contentType: "image/png", size: MAX_BLOB_IMAGE_BYTES }).ok).toBe(true)
    expect(validateBlobUpload({ contentType: "application/pdf", size: MAX_BLOB_PDF_BYTES }).ok).toBe(true)
    expect(validateBlobUpload({ contentType: "video/mp4", size: MAX_BLOB_VIDEO_BYTES }).ok).toBe(true)
  })

  it("recusa 1 byte acima do teto do grupo, nomeando o grupo", () => {
    const image = validateBlobUpload({ contentType: "image/png", size: MAX_BLOB_IMAGE_BYTES + 1 })
    expect(image.ok).toBe(false)
    expect(image.error).toContain("5 MB")
    expect(image.error).toContain("image")

    const pdf = validateBlobUpload({ contentType: "application/pdf", size: MAX_BLOB_PDF_BYTES + 1 })
    expect(pdf.ok).toBe(false)
    expect(pdf.error).toContain("20 MB")
  })

  it("recusa tipo não permitido e arquivo vazio", () => {
    expect(validateBlobUpload({ contentType: "text/plain", size: 10 }).error).toContain(
      "não permitido",
    )
    expect(validateBlobUpload({ contentType: "image/png", size: 0 }).error).toContain("vazio")
    expect(validateBlobUpload({ contentType: "image/png", size: Number.NaN }).ok).toBe(false)
  })
})

describe("validateBlobUpload — assinatura de conteúdo (V5-2c)", () => {
  const head = (...bytes: number[]) => new Uint8Array(bytes)
  const PNG = head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  const PDF = head(..."%PDF-1.7".split("").map((c) => c.charCodeAt(0)))
  const MP4 = head(0x00, 0x00, 0x00, 0x20, ..."ftypisom".split("").map((c) => c.charCodeAt(0)))

  it("cabeça que casa com o tipo declarado passa", () => {
    expect(validateBlobUpload({ contentType: "image/png", size: 10, head: PNG }).ok).toBe(true)
    expect(validateBlobUpload({ contentType: "application/pdf", size: 10, head: PDF }).ok).toBe(true)
    expect(validateBlobUpload({ contentType: "video/mp4", size: 10, head: MP4 }).ok).toBe(true)
  })

  it("cabeça que não casa é recusada nomeando o tipo declarado", () => {
    // Um .png renomeado para .pdf: o tipo declarado é pdf, a assinatura é de png.
    const result = validateBlobUpload({ contentType: "application/pdf", size: 10, head: PNG })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Conteúdo não corresponde ao tipo declarado")
    expect(result.error).toContain("application/pdf")
  })

  it("sem cabeça a checagem não acontece (allowlist + tamanho só) — é assim que a suíte roda sem arquivo", () => {
    expect(validateBlobUpload({ contentType: "application/pdf", size: 10 }).ok).toBe(true)
  })

  it("a tabela é a MESMA do anexo de relatório, e mime sem assinatura é lista nomeada", () => {
    // `text/plain` não tem assinatura: passa por decisão explícita, não por default aberto.
    expect(magicMatches("text/plain", head(0x00, 0x01, 0x02))).toBe(true)
    // Mime fora da tabela deixa de passar "porque não há regra" (mudança medida do default).
    expect(magicMatches("application/octet-stream", PNG)).toBe(false)
    // O que o seam de relatório já aprovava continua aprovado: mesma tabela, um lugar só.
    expect(magicMatches("image/webp", head(..."RIFF".split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ..."WEBP".split("").map((c) => c.charCodeAt(0))))).toBe(true)
    expect(magicMatches("video/webm", head(0x1a, 0x45, 0xdf, 0xa3))).toBe(true)
  })
})

describe("chave do blob — prefixo sem traversal", () => {
  it("monta prefixo/uuid.extensão", () => {
    const key = newBlobKey("projects/12/activities/3", "application/pdf")
    expect(key).toMatch(/^projects\/12\/activities\/3\/[0-9a-f-]{36}\.pdf$/)
    expect(newBlobKey("projects/12/logo", "image/webp")).toMatch(/\/[0-9a-f-]{36}\.webp$/)
  })

  it("rejeita prefixo com `..`, segmento vazio ou vazio", () => {
    expect(() => sanitizeBlobPrefix("projects/../etc")).toThrow(/inválido/)
    expect(() => sanitizeBlobPrefix("projects//logo")).toThrow(/inválido/)
    expect(() => sanitizeBlobPrefix("")).toThrow(/inválido/)
    expect(() => sanitizeBlobPrefix("/")).toThrow(/inválido/)
  })

  it("normaliza barras invertidas e barras nas pontas", () => {
    expect(sanitizeBlobPrefix("projects\\12\\logo")).toBe("projects/12/logo")
    expect(sanitizeBlobPrefix("/projects/12/logo/")).toBe("projects/12/logo")
  })
})

describe("blobStoreConfigFromEnv — sem endpoint/bucket não há bucket", () => {
  it("null quando endpoint ou bucket faltam (app atual não usa bucket)", () => {
    expect(blobStoreConfigFromEnv({})).toBeNull()
    expect(blobStoreConfigFromEnv({ S3_ENDPOINT: "http://x:8333" })).toBeNull()
    expect(blobStoreConfigFromEnv({ S3_BUCKET: "displayquest" })).toBeNull()
  })

  it("lê endpoint, bucket, credenciais e defaults; tira a barra final", () => {
    const config = blobStoreConfigFromEnv({
      S3_ENDPOINT: "http://seaweedfs:8333/",
      S3_ACCESS_KEY: "app",
      S3_SECRET_KEY: "s3cr3t",
      S3_BUCKET: "displayquest",
    })
    expect(config).toEqual({
      endpoint: "http://seaweedfs:8333",
      region: "us-east-1",
      accessKeyId: "app",
      secretAccessKey: "s3cr3t",
      bucket: "displayquest",
      forcePathStyle: true,
    })
  })

  it("respeita S3_REGION e S3_FORCE_PATH_STYLE=false", () => {
    const config = blobStoreConfigFromEnv({
      S3_ENDPOINT: "https://s3.amazonaws.com",
      S3_BUCKET: "b",
      S3_REGION: "sa-east-1",
      S3_FORCE_PATH_STYLE: "false",
    })
    expect(config?.region).toBe("sa-east-1")
    expect(config?.forcePathStyle).toBe(false)
  })
})

describe("createS3BlobStore — mapeamento para os comandos S3", () => {
  function fakeClient(send: (command: unknown) => Promise<unknown>): BlobS3Client {
    return { send: vi.fn(send) }
  }

  it("put envia PutObjectCommand com bucket, chave, corpo e tipo", async () => {
    const send = vi.fn().mockResolvedValue({})
    const store = createS3BlobStore(CONFIG, { send })

    await store.put("projects/1/logo.png", new Uint8Array([1, 2, 3]), "image/png")

    const { name, input } = commandOf(send.mock.calls[0][0])
    expect(name).toBe("PutObjectCommand")
    expect(input.Bucket).toBe("displayquest")
    expect(input.Key).toBe("projects/1/logo.png")
    expect(input.ContentType).toBe("image/png")
    expect(input.Body).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("get devolve bytes, tamanho e tipo", async () => {
    const store = createS3BlobStore(
      CONFIG,
      fakeClient(async () => ({
        Body: { transformToByteArray: async () => new Uint8Array([9, 8, 7, 6]) },
        ContentType: "image/png",
        ContentLength: 4,
      })),
    )

    await expect(store.get("projects/1/logo.png")).resolves.toEqual({
      key: "projects/1/logo.png",
      body: new Uint8Array([9, 8, 7, 6]),
      size: 4,
      contentType: "image/png",
    })
  })

  it("get devolve null para objeto ausente (NoSuchKey e 404)", async () => {
    const noSuchKey = createS3BlobStore(
      CONFIG,
      fakeClient(async () => {
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" })
      }),
    )
    await expect(noSuchKey.get("k")).resolves.toBeNull()

    const notFound = createS3BlobStore(
      CONFIG,
      fakeClient(async () => {
        throw Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } })
      }),
    )
    await expect(notFound.get("k")).resolves.toBeNull()
  })

  it("get não engole erro que não é ausência", async () => {
    const store = createS3BlobStore(
      CONFIG,
      fakeClient(async () => {
        throw Object.assign(new Error("boom"), { name: "AccessDenied" })
      }),
    )
    await expect(store.get("k")).rejects.toThrow("boom")
  })

  it("head devolve metadados e null quando o objeto não existe", async () => {
    const present = createS3BlobStore(
      CONFIG,
      fakeClient(async () => ({ ContentType: "application/pdf", ContentLength: 42 })),
    )
    await expect(present.head("k")).resolves.toEqual({
      key: "k",
      size: 42,
      contentType: "application/pdf",
    })

    const missing = createS3BlobStore(
      CONFIG,
      fakeClient(async () => {
        throw Object.assign(new Error("missing"), { name: "NotFound" })
      }),
    )
    await expect(missing.head("k")).resolves.toBeNull()
  })

  it("remove envia DeleteObjectCommand (idempotente)", async () => {
    const send = vi.fn().mockResolvedValue({})
    const store = createS3BlobStore(CONFIG, { send })

    await store.remove("projects/1/logo.png")

    const { name, input } = commandOf(send.mock.calls[0][0])
    expect(name).toBe("DeleteObjectCommand")
    expect(input.Bucket).toBe("displayquest")
    expect(input.Key).toBe("projects/1/logo.png")
  })
})
