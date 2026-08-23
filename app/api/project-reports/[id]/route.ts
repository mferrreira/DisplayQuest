import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { reporting: reportingModule } = getBackendComposition()

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("não encontrado")) return 404
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

function parseId(raw: string): number | null {
  const id = Number(raw)
  return /^\d+$/.test(raw) && id > 0 ? id : null
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseId(params.id)
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    const report = await reportingModule.getProjectReport(auth.actor.id, auth.actor.roles, id)
    if (!report) return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })

    return NextResponse.json({ projectReport: report })
  } catch (error: unknown) {
    console.error("Erro ao buscar relatório de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar relatório de projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseId(params.id)
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const projectReport = await reportingModule.updateProjectReport({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      reportId: id,
      ...(body?.title !== undefined ? { title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null } : {}),
      ...(body?.content !== undefined ? { content: String(body.content) } : {}),
    })

    return NextResponse.json({ projectReport })
  } catch (error: unknown) {
    console.error("Erro ao atualizar relatório de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao atualizar relatório de projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseId(params.id)
    if (!id) return NextResponse.json({ error: "id inválido" }, { status: 400 })

    await reportingModule.deleteProjectReport({
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      reportId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Erro ao excluir relatório de projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao excluir relatório de projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
