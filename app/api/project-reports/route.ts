import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { isReportPeriodType } from "@/lib/constants/report-periods"
import {
  sanitizeDisplayName,
  storeReportFile,
  validateReportFile,
} from "@/lib/storage/report-uploads"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// OND7-B4 (R4): DomainErrors mapeados por domainErrorResponse — mesmos status do
// toHttpStatus por mensagem anterior ("Acesso negado" 403 / "não encontrado" 404 /
// "inválid"|"Dados inválidos" 400), agora tipados (contract OND7-B3).
const { reporting: reportingModule } = getBackendComposition()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = auth.actor
    const { searchParams } = new URL(request.url)
    const projectIdRaw = searchParams.get("projectId")
    const periodType = searchParams.get("periodType") ?? undefined
    const authorIdRaw = searchParams.get("authorId")
    const from = searchParams.get("from") ?? undefined
    const to = searchParams.get("to") ?? undefined

    for (const [name, raw] of [["projectId", projectIdRaw], ["authorId", authorIdRaw]] as const) {
      if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) <= 0)) {
        return NextResponse.json({ error: `${name} inválido` }, { status: 400 })
      }
    }
    if (periodType !== undefined && !isReportPeriodType(periodType)) {
      return NextResponse.json({ error: "periodType inválido" }, { status: 400 })
    }

    // D6: limpeza lazy de órfãos em leituras (fire-and-forget)
    void reportingModule.sweepStaleReportUploads().catch(() => undefined)

    const reports = await reportingModule.listProjectReports({
      actorUserId: actor.id,
      actorRoles: actor.roles,
      ...(projectIdRaw ? { projectId: Number(projectIdRaw) } : {}),
      ...(periodType ? { periodType } : {}),
      ...(authorIdRaw ? { authorId: Number(authorIdRaw) } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    })

    return NextResponse.json({ projectReports: reports })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao listar relatórios de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao listar relatórios de projeto"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = auth.actor
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: "FormData inválido" }, { status: 400 })
    }

    const projectIdRaw = String(form.get("projectId") ?? "")
    const periodType = String(form.get("periodType") ?? "")
    const content = String(form.get("content") ?? "")
    const titleRaw = form.get("title")
    const reference = form.get("reference")

    if (!/^\d+$/.test(projectIdRaw) || Number(projectIdRaw) <= 0) {
      return NextResponse.json({ error: "projectId inválido" }, { status: 400 })
    }
    if (!isReportPeriodType(periodType)) {
      return NextResponse.json({ error: "periodType inválido" }, { status: 400 })
    }
    if (!content.trim()) {
      return NextResponse.json({ error: "Dados inválidos: conteúdo obrigatório" }, { status: 400 })
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0)
    for (const file of files) {
      const validation = await validateReportFile(file)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }
    }

    const { report, created } = await reportingModule.createProjectReport({
      actorUserId: actor.id,
      actorRoles: actor.roles,
      projectId: Number(projectIdRaw),
      periodType,
      reference: typeof reference === "string" && reference ? reference : undefined,
      title: typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null,
      content,
    })

    let updatedReport = report
    for (const file of files) {
      const stored = await storeReportFile(report.id, file)
      try {
        updatedReport = await reportingModule.registerReportAttachment({
          actorUserId: actor.id,
          actorRoles: actor.roles,
          reportId: report.id,
          fileName: sanitizeDisplayName(file.name),
          storedPath: stored.storedPath,
          mimeType: file.type,
          sizeBytes: file.size,
        })
      } catch (error) {
        await import("@/lib/storage/report-uploads").then((m) =>
          m.removeStoredReportFile(stored.storedPath),
        )
        throw error
      }
    }

    return NextResponse.json(
      { projectReport: updatedReport, created },
      { status: created ? 201 : 200 },
    )
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar relatório de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar relatório de projeto"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
