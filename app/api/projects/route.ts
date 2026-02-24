import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { projectManagement: projectManagementModule } = getBackendComposition()
function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("não encontrado")) return 404
  if (message.includes("Acesso negado") || message.includes("permissão")) return 403
  if (message.includes("Dados inválidos") || message.includes("obrigatório")) return 400
  return 500
}

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const projects = await projectManagementModule.listProjectsForActor({
      actorId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ projects }, { status: 200 })
  } catch (error: unknown) {
    console.error("Erro ao buscar projetos:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar projetos"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_PROJECTS", "Sem permissão para criar projeto")
    if (permissionError) return permissionError

    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
    }

    const leaderId = typeof body.leaderId === "number"
      ? body.leaderId
      : body.leaderId
        ? Number(body.leaderId)
        : null

    const volunteerIds = Array.isArray(body.volunteerIds)
      ? body.volunteerIds
          .map((value: unknown) => Number(value))
          .filter((value: number) => !Number.isNaN(value))
      : []

    const project = await projectManagementModule.createProject({
      actorId: auth.actor.id,
      data: {
        name: body.name,
        description: body.description || "",
        status: body.status || "active",
        leaderId,
        links: body.links || [],
      },
      volunteerIds,
    })

    return NextResponse.json({ project }, { status: 201 })
  } catch (error: unknown) {
    console.error("Erro ao criar projeto:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar projeto"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
