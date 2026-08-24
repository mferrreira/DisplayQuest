import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import {
  sanitizeDisplayName,
  storeReportFile,
  validateReportFile,
} from "@/lib/storage/report-uploads"

const { reporting: reportingModule } = getBackendComposition()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("não encontrado")) return 404
  return 500
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const reportId = Number(params.id)
    if (!/^\d+$/.test(params.id) || reportId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "FormData inválido" }, { status: 400 })
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
    }

    for (const file of files) {
      const validation = await validateReportFile(file)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
    }

    let projectReport = null as any
    const written: string[] = []
    for (const file of files) {
      const stored = await storeReportFile(reportId, file)
      written.push(stored.storedPath)
      projectReport = await reportingModule.registerReportAttachment({
        actorUserId: auth.actor.id,
        actorRoles: auth.actor.roles,
        reportId,
        fileName: sanitizeDisplayName(file.name),
        storedPath: stored.storedPath,
        mimeType: file.type,
        sizeBytes: file.size,
      })
    }

    return NextResponse.json({ projectReport }, { status: 201 })
  } catch (error: unknown) {
    console.error("Erro ao anexar arquivos:", error)
    const message = error instanceof Error ? error.message : "Erro ao anexar arquivos"
    // Arquivos órfãos eventuais são removidos pelo sweep lazy (D6)
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
