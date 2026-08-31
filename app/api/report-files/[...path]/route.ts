import { NextResponse } from "next/server"
import path from "path"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { absolutePathOf, readReportFileBytes } from "@/lib/storage/report-uploads"

const { reporting: reportingModule } = getBackendComposition()

// A11: relatórios saíram de public/uploads/reports e passam a ser servidos só
// por esta rota, com a MESMA regra de acesso da rota /api/project-reports/[id]
// (getProjectReport: papel de gestão OU líder do projeto).

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
}

function reportIdFromPath(segments: string[]): number | null {
  if (segments[0] !== "uploads" || segments[1] !== "reports") return null
  const raw = segments[2]
  if (!/^\d+$/.test(raw ?? "")) return null
  const id = Number(raw)
  return id > 0 ? id : null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const segments = (await context.params).path ?? []
    const storedPath = segments.join("/")
    const reportId = reportIdFromPath(segments)
    const abs = absolutePathOf(storedPath)
    if (!reportId || !abs) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    // Mesma checagem de acesso do relatório (getProjectReport → "Acesso negado" fora da regra)
    await reportingModule.getProjectReport(auth.actor.id, auth.actor.roles, reportId)

    const bytes = await readReportFileBytes(storedPath)
    if (!bytes) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
    }

    const ext = path.extname(abs).slice(1).toLowerCase()
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream"
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (error: unknown) {
    console.error("Erro ao servir arquivo de relatório:", error)
    const message = error instanceof Error ? error.message : "Erro ao servir arquivo"
    const status = message.includes("Acesso negado")
      ? 403
      : message.includes("não encontrado")
        ? 404
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}