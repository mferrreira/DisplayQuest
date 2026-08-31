import { randomUUID } from "crypto"
import fs from "fs"
import path from "path"

export const MAX_REPORT_FILE_BYTES = 20 * 1024 * 1024 // 20 MB (D5)
// A11: raiz privada — fora de public/. Relatórios só são servidos pela rota
// autenticada app/api/report-files/[...path]/route.ts (nunca estáticos).
export const REPORT_UPLOADS_ROOT = path.join(process.cwd(), "data", "uploads", "reports")
export const SWEEP_MAX_AGE_MS = 48 * 60 * 60 * 1000 // D6: lazy sweep on read

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
])

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

export interface ReportFileValidation {
  ok: boolean
  error?: string
}

function magicMatches(mime: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  const ascii = (offset: number, text: string) =>
    text.split("").every((ch, i) => head[offset + i] === ch.charCodeAt(0))

  switch (mime) {
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47)
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff)
    case "image/gif":
      return ascii(0, "GIF8")
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP")
    case "application/pdf":
      return ascii(0, "%PDF")
    case "video/mp4":
    case "video/quicktime":
      return ascii(4, "ftyp")
    case "video/webm":
      return starts(0x1a, 0x45, 0xdf, 0xa3)
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return starts(0xd0, 0xcf, 0x11, 0xe0) // OLE2
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return starts(0x50, 0x4b, 0x03, 0x04) // ZIP
    default:
      return true // text/plain & text/csv have no signature
  }
}

export async function validateReportFile(file: File): Promise<ReportFileValidation> {
  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: `Tipo de arquivo não permitido: ${file.type || "desconhecido"}` }
  }
  if (file.size > MAX_REPORT_FILE_BYTES) {
    return { ok: false, error: `Arquivo excede o limite de 20 MB (${file.name})` }
  }
  if (file.size === 0) {
    return { ok: false, error: `Arquivo vazio (${file.name})` }
  }

  const headBuffer = await file.slice(0, 16).arrayBuffer()
  if (!magicMatches(file.type, new Uint8Array(headBuffer))) {
    return { ok: false, error: `Conteúdo não corresponde ao tipo declarado (${file.name})` }
  }
  return { ok: true }
}

export function sanitizeDisplayName(name: string): string {
  const base = path.basename(name || "arquivo").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
  return base.slice(0, 255) || "arquivo"
}

export interface StoredReportFile {
  storedPath: string
  absolutePath: string
}

export async function storeReportFile(reportId: number, file: File): Promise<StoredReportFile> {
  const ext = MIME_EXT[file.type] ?? "bin"
  const dir = path.join(REPORT_UPLOADS_ROOT, String(reportId))
  await fs.promises.mkdir(dir, { recursive: true })

  const fileName = `${randomUUID()}.${ext}`
  const absolutePath = path.join(dir, fileName)
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.promises.writeFile(absolutePath, buffer)

  return {
    storedPath: path.posix.join("uploads", "reports", String(reportId), fileName),
    absolutePath,
  }
}

export function absolutePathOf(storedPath: string): string | null {
  if (!storedPath) return null
  const withSlashes = storedPath.replace(/\\/g, "/")
  if (withSlashes !== storedPath) return null // barra invertida: rejeita, sem normalizar
  if (/^[a-z][a-z0-9+.-]*:/i.test(withSlashes)) return null // esquema (http://, data:, c:)
  if (withSlashes.startsWith("/")) return null // caminho absoluto / leading slash
  if (!withSlashes.startsWith("uploads/reports/")) return null // prefixo público esperado
  if (withSlashes.includes("..")) return null // traversal
  const relative = withSlashes.slice("uploads/reports/".length)
  const abs = path.join(REPORT_UPLOADS_ROOT, relative)
  if (!abs.startsWith(REPORT_UPLOADS_ROOT + path.sep)) return null
  return abs
}

export async function removeStoredReportFile(storedPath: string): Promise<void> {
  const abs = absolutePathOf(storedPath)
  if (!abs) return
  await fs.promises.rm(abs, { force: true })
}

/**
 * A11: lê bytes de um arquivo de relatório já validado por absolutePathOf.
 * null para template/traversal OU arquivo ausente — a rota autenticada
 * app/api/report-files/[...path]/route.ts usa este seam (nunca lê fs direto).
 */
export async function readReportFileBytes(storedPath: string): Promise<Buffer | null> {
  const abs = absolutePathOf(storedPath)
  if (!abs) return null
  try {
    return await fs.promises.readFile(abs)
  } catch {
    return null
  }
}

/** D6: removes stored files older than maxAge that are not referenced by any DB row. */
export async function sweepStaleReportUploads(
  referencedPaths: string[],
  maxAgeMs = SWEEP_MAX_AGE_MS,
): Promise<number> {
  let removed = 0
  if (!fs.existsSync(REPORT_UPLOADS_ROOT)) return 0
  const referenced = new Set(referencedPaths.map((p) => p.replace(/\\/g, "/")))

  const walk = async (dir: string): Promise<Array<{ file: string; mtime: number }>> => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const found: Array<{ file: string; mtime: number }> = []
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        found.push(...(await walk(full)))
      } else {
        const stat = await fs.promises.stat(full).catch(() => null)
        if (stat) found.push({ file: full, mtime: stat.mtimeMs })
      }
    }
    return found
  }

  const files = await walk(REPORT_UPLOADS_ROOT)
  for (const item of files) {
    const relative = path.relative(process.cwd(), item.file).replace(/\\/g, "/")
    if (referenced.has(relative)) continue
    if (Date.now() - item.mtime > maxAgeMs) {
      await fs.promises.rm(item.file, { force: true })
      removed++
    }
  }

  // remove empty report dirs left behind
  const dirs = await fs.promises.readdir(REPORT_UPLOADS_ROOT, { withFileTypes: true })
  for (const d of dirs) {
    if (d.isDirectory()) {
      const dirPath = path.join(REPORT_UPLOADS_ROOT, d.name)
      const rest = await fs.promises.readdir(dirPath)
      if (rest.length === 0) await fs.promises.rmdir(dirPath)
    }
  }
  return removed
}
