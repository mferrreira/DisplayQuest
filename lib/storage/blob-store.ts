import { randomUUID } from "crypto"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { magicMatches } from "./magic-bytes"

/**
 * V5-1 (DEC-101) — seam de blobs em bucket S3-compatible.
 *
 * Mesmo desenho de `lib/storage/report-uploads.ts`: rota e adapter nunca falam com o SDK
 * direto, importam este seam (gotcha A11 — o teste mocka a lib, não o builtin).
 *
 * O servidor do bucket é **SeaweedFS** (DEC-131): a imagem oficial do MinIO saiu do
 * Docker Hub e o projeto foi arquivado, então o plano deixou de nomear o servidor. O
 * protocolo continua S3, então este seam é trocável por endpoint/env.
 *
 * Sem consumidor de produção no V5-1: o V5-2 liga o port
 * `backend/modules/project-management/application/ports/blob-store.port.ts` ao adapter
 * `infrastructure/adapters/s3-blob-store.ts`. O cliente S3 é injetável para que a suíte
 * de unit rode sem bucket no ar.
 */

export type BlobKind = "image" | "pdf" | "video" | "document"

export interface BlobMimeRule {
  readonly kind: BlobKind
  readonly maxBytes: number
  readonly extension: string
}

/** Regra 11 do plano: mesmo teto do avatar (`lib/utils/image-processor.ts`). */
export const MAX_BLOB_IMAGE_BYTES = 5 * 1024 * 1024
/** Mesmo teto dos anexos de relatório (`MAX_REPORT_FILE_BYTES`). */
export const MAX_BLOB_PDF_BYTES = 20 * 1024 * 1024
/** Infra preparada; nenhuma tela de vídeo no plan-v5 (DEC-101). Teto provisório. */
export const MAX_BLOB_VIDEO_BYTES = 100 * 1024 * 1024
/** DOCX do relatório técnico (V5-9b, DEC-129): gerado pelo adaptador a partir do oficial —
 *  o binário é pequeno por construção; o teto é o mesmo do PDF por coerência de grupo. */
export const MAX_BLOB_DOCUMENT_BYTES = 20 * 1024 * 1024

/** O mime do documento Office que o gerador escreve — uma grafia só (rota + adaptador). */
export const BLOB_DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

function mimeRule(kind: BlobKind, maxBytes: number, extension: string): BlobMimeRule {
  return { kind, maxBytes, extension }
}

/**
 * Allowlist do bucket: **imagens, PDF, vídeo e documento Office** (DEC-101; documento entra
 * no V5-9b para o DOCX gerado pelo adaptador do relatório técnico, DEC-129). A assinatura
 * do DOCX é a de ZIP, já congelada na tabela única (`lib/storage/magic-bytes.ts`). O
 * formulário de anexos tem `accept` próprio e **não** passou a aceitar documento de
 * escritório: quem move este byte é o gerador, não o upload de pessoa.
 */
export const BLOB_MIME_RULES: Readonly<Record<string, BlobMimeRule>> = {
  "image/png": mimeRule("image", MAX_BLOB_IMAGE_BYTES, "png"),
  "image/jpeg": mimeRule("image", MAX_BLOB_IMAGE_BYTES, "jpg"),
  "image/webp": mimeRule("image", MAX_BLOB_IMAGE_BYTES, "webp"),
  "image/gif": mimeRule("image", MAX_BLOB_IMAGE_BYTES, "gif"),
  "application/pdf": mimeRule("pdf", MAX_BLOB_PDF_BYTES, "pdf"),
  [BLOB_DOCX_CONTENT_TYPE]: mimeRule(
    "document",
    MAX_BLOB_DOCUMENT_BYTES,
    "docx",
  ),
  "video/mp4": mimeRule("video", MAX_BLOB_VIDEO_BYTES, "mp4"),
  "video/webm": mimeRule("video", MAX_BLOB_VIDEO_BYTES, "webm"),
  "video/quicktime": mimeRule("video", MAX_BLOB_VIDEO_BYTES, "mov"),
}

export const BLOB_ALLOWED_MIME: ReadonlyArray<string> = Object.keys(BLOB_MIME_RULES)

function normalizeContentType(contentType: string): string {
  return (contentType ?? "").split(";")[0].trim().toLowerCase()
}

export function blobRuleFor(contentType: string): BlobMimeRule | null {
  return BLOB_MIME_RULES[normalizeContentType(contentType)] ?? null
}

export function isAllowedBlobContentType(contentType: string): boolean {
  return blobRuleFor(contentType) !== null
}

/**
 * O mime é de imagem, segundo a allowlist desta seam (V5-2d, DEC-102). Existe porque logo/banner
 * aceitam menos que um anexo: pdf e vídeo são blobs válidos do bucket, mas não são imagem de
 * projeto. A checagem fica aqui — a allowlist mora nesta seam, e duplicá-la no domínio ou na rota
 * é a regra em duas cópias (DEC-90/134).
 */
export function isImageBlobContentType(contentType: string): boolean {
  return blobRuleFor(contentType)?.kind === "image"
}

export function blobExtensionFor(contentType: string): string {
  return blobRuleFor(contentType)?.extension ?? "bin"
}

export interface BlobUploadCandidate {
  contentType: string
  size: number
  /**
   * Cabeça do arquivo (até `MAGIC_HEAD_BYTES`). Quando presente, a assinatura é conferida;
   * quando ausente, a validação é só de allowlist + tamanho — é o que a suíte de unit faz
   * sem arquivo no ar.
   */
  head?: Uint8Array
}

export interface BlobValidation {
  ok: boolean
  error?: string
}

/**
 * Allowlist + teto por tipo + assinatura de conteúdo (V5-2c). A tabela de magic bytes é a
 * mesma do anexo de relatório (`lib/storage/magic-bytes.ts`): dois seams, uma regra.
 */
export function validateBlobUpload(input: BlobUploadCandidate): BlobValidation {
  const type = normalizeContentType(input.contentType)
  const rule = BLOB_MIME_RULES[type]
  if (!rule) {
    return { ok: false, error: `Tipo de arquivo não permitido: ${type || "desconhecido"}` }
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "Arquivo vazio" }
  }
  if (input.size > rule.maxBytes) {
    const mb = Math.round(rule.maxBytes / (1024 * 1024))
    return { ok: false, error: `Arquivo excede o limite de ${mb} MB para ${rule.kind}` }
  }
  if (input.head && !magicMatches(type, input.head)) {
    return { ok: false, error: `Conteúdo não corresponde ao tipo declarado (${type})` }
  }
  return { ok: true }
}

/**
 * Normaliza e valida um prefixo de chave (`projects/12/activities/3`). Rejeita
 * segmentos vazios, `.` e `..` — mesma postura de `absolutePathOf` contra traversal.
 */
export function sanitizeBlobPrefix(prefix: string): string {
  const normalized = (prefix ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
  const segments = normalized.split("/")
  if (normalized === "" || segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Prefixo de blob inválido: ${prefix}`)
  }
  return normalized
}

/** Chave única dentro do prefixo, com a extensão do tipo declarado. */
export function newBlobKey(prefix: string, contentType: string): string {
  return `${sanitizeBlobPrefix(prefix)}/${randomUUID()}.${blobExtensionFor(contentType)}`
}

export interface BlobStoreConfig {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  forcePathStyle: boolean
}

const DEFAULT_REGION = "us-east-1"

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = (value ?? "").trim()
    if (trimmed !== "") return trimmed
  }
  return null
}

/**
 * Lê a configuração do bucket do ambiente. `null` quando endpoint ou bucket faltam —
 * quem liga a porta decide o que fazer (o app atual não usa bucket e não pode quebrar).
 */
export function blobStoreConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobStoreConfig | null {
  const endpoint = firstNonEmpty(env.S3_ENDPOINT)
  const bucket = firstNonEmpty(env.S3_BUCKET)
  if (!endpoint || !bucket) return null

  const forcePathStyle = (env.S3_FORCE_PATH_STYLE ?? "true").trim() !== "false"
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: firstNonEmpty(env.S3_REGION) ?? DEFAULT_REGION,
    accessKeyId: (env.S3_ACCESS_KEY ?? "").trim(),
    secretAccessKey: env.S3_SECRET_KEY ?? "",
    bucket,
    forcePathStyle,
  }
}

export interface BlobMetadata {
  key: string
  size: number
  contentType: string | null
}

export interface BlobObject extends BlobMetadata {
  body: Uint8Array
}

/** Cliente mínimo aceito pelo seam — permite injetar um duplo na suíte de unit. */
export interface BlobS3Client {
  send(command: unknown): Promise<unknown>
}

export interface BlobStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<BlobObject | null>
  head(key: string): Promise<BlobMetadata | null>
  remove(key: string): Promise<void>
}

function isNotFoundError(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null
  if (!candidate) return false
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  )
}

interface RawGetOutput {
  Body?: { transformToByteArray?: () => Promise<Uint8Array> }
  ContentType?: string
  ContentLength?: number
}

interface RawHeadOutput {
  ContentType?: string
  ContentLength?: number
}

/**
 * Store S3 sobre o bucket configurado. `client` é o seam de teste: sem ele o
 * `S3Client` real é criado (nenhuma conexão acontece na construção).
 */
export function createS3BlobStore(config: BlobStoreConfig, client?: BlobS3Client): BlobStore {
  const s3: BlobS3Client =
    client ??
    (new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }) as unknown as BlobS3Client)

  return {
    async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
      await s3.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },

    async get(key: string): Promise<BlobObject | null> {
      let output: RawGetOutput
      try {
        output = (await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))) as RawGetOutput
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
      const bytes = output.Body?.transformToByteArray
        ? await output.Body.transformToByteArray()
        : new Uint8Array()
      return {
        key,
        body: bytes,
        size: bytes.byteLength,
        contentType: output.ContentType ?? null,
      }
    },

    async head(key: string): Promise<BlobMetadata | null> {
      let output: RawHeadOutput
      try {
        output = (await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))) as RawHeadOutput
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
      return {
        key,
        size: output.ContentLength ?? 0,
        contentType: output.ContentType ?? null,
      }
    },

    async remove(key: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }))
    },
  }
}

/**
 * Instância do bucket a partir do ambiente, criada na primeira chamada e reaproveitada
 * enquanto a configuração for a mesma (V5-2c).
 *
 * Devolve `null` quando o ambiente não configura o bucket — é o que impede o app inteiro de
 * quebrar na importação: `getBackendComposition()` roda no topo de toda rota, e um `throw`
 * aqui derrubava tudo que não usa bucket. Quem consome decide o que fazer com o `null` (a
 * rota de anexo responde 503).
 *
 * A comparação é por valor de configuração, não por identidade: um teste que troca o ambiente
 * recebe um cliente novo, e a produção não cria um `S3Client` por requisição.
 */
let cachedConfig: BlobStoreConfig | null = null
let cachedStore: BlobStore | null = null

function sameConfig(a: BlobStoreConfig, b: BlobStoreConfig): boolean {
  return (
    a.endpoint === b.endpoint &&
    a.region === b.region &&
    a.accessKeyId === b.accessKeyId &&
    a.secretAccessKey === b.secretAccessKey &&
    a.bucket === b.bucket &&
    a.forcePathStyle === b.forcePathStyle
  )
}

export function blobStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlobStore | null {
  const config = blobStoreConfigFromEnv(env)
  if (!config) return null
  if (cachedStore && cachedConfig && sameConfig(cachedConfig, config)) return cachedStore

  cachedConfig = config
  cachedStore = createS3BlobStore(config)
  return cachedStore
}
