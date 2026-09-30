import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { projectManagement: projectManagementModule } = getBackendComposition()

// OND5-B3 (R4): business errors are typed DomainErrors thrown by the use cases and mapped
// by domainErrorResponse (status + code + details). The old message-heuristic toHttpStatus
// is gone; unknown errors keep the generic 500.

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar projetos:", error)
    return NextResponse.json({ error: "Erro ao buscar projetos" }, { status: 500 })
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar projeto:", error)
    return NextResponse.json({ error: "Erro ao criar projeto" }, { status: 500 })
  }
}
