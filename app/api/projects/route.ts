import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { userActor } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { projectManagement: projectManagementModule } = getBackendComposition()

// OND5-B3 (R4): business errors are typed DomainErrors thrown by the use cases and mapped
// by domainErrorResponse (status + code + details). The old message-heuristic toHttpStatus
// is gone; unknown errors keep the generic 500.
// B6-3 (D4): o gate MANAGE_PROJECTS (mensagem propria "Sem permissão para criar projeto")
// desceu para CreateProjectUseCase; a rota chama assertCanCreateProject ANTES de ler o corpo
// (o gate legado vinha antes do parse — padrao B6-2b/2d) e o use case recheca. O GET ja
// estava no formato certo (a escopo mora em ListProjectsForActorUseCase).

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
    return routeErrorResponse(error, { fallback: "Erro ao buscar projetos" })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const actor = userActor(auth.actor.id, auth.actor.roles)
    projectManagementModule.assertCanCreateProject({ actor })

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
      actor,
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
    return routeErrorResponse(error, { fallback: "Erro ao criar projeto" })
  }
}
