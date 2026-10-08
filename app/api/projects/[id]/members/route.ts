import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { normalizeRoles } from "@/backend/domain"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { projectMembership: projectMembershipModule } = getBackendComposition()
type MemberAction = "add" | "remove" | "set_roles" | "set_leader"

// OND5-B3 (R4): typed DomainErrors mapped by domainErrorResponse; the route no longer
// imports @prisma/client or lib/auth/rbac (rg06 allow-list entry removed — normalizeRoles
// comes from backend/domain, which RG-06 allows). EVOLUTION: "já é membro", "já é líder de
// outro projeto" and "último gerente" were 400 by heuristic; they are ConflictError -> 409
// now (pinned by the contract suite OND5-B3).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const routeParams = await params
    const projectId = Number(routeParams.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const members = await projectMembershipModule.listProjectMembers({
      projectId,
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
    })

    return NextResponse.json({ members }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return await handleMutation(request, params, false)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return await handleMutation(request, params, true)
}

async function handleMutation(
  request: Request,
  params: Promise<{ id: string }>,
  strictAction: boolean,
) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const routeParams = await params
    const projectId = Number(routeParams.id)
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return NextResponse.json({ error: "Projeto inválido" }, { status: 400 })
    }

    const body = await request.json()
    const action = resolveAction(body, strictAction)
    if (!action) {
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
    }

    if (action === "add") {
      const targetUserId = Number(body?.userId)
      const roles = normalizeRoles(body?.roles)
      if (!Number.isInteger(targetUserId) || targetUserId <= 0 || !Array.isArray(body?.roles)) {
        return NextResponse.json({ error: "userId e roles são obrigatórios" }, { status: 400 })
      }

      const membership = await projectMembershipModule.addProjectMember({
        projectId,
        actorUserId: auth.actor.id,
        actorRoles: auth.actor.roles,
        targetUserId,
        roles,
      })

      return NextResponse.json({ membership }, { status: 201 })
    }

    if (action === "remove") {
      const membershipId = Number(body?.membershipId)
      if (!Number.isInteger(membershipId) || membershipId <= 0) {
        return NextResponse.json({ error: "membershipId é obrigatório" }, { status: 400 })
      }

      const result = await projectMembershipModule.removeProjectMember({
        projectId,
        actorUserId: auth.actor.id,
        actorRoles: auth.actor.roles,
        membershipId,
      })

      return NextResponse.json(
        { message: `Membro ${result.memberName || ""} removido do projeto com sucesso` },
        { status: 200 },
      )
    }

    if (action === "set_roles") {
      const targetUserId = Number(body?.userId)
      const roles = normalizeRoles(body?.roles)
      if (!Number.isInteger(targetUserId) || targetUserId <= 0 || !Array.isArray(body?.roles)) {
        return NextResponse.json({ error: "userId e roles são obrigatórios" }, { status: 400 })
      }

      const membership = await projectMembershipModule.upsertProjectMemberRoles({
        projectId,
        actorUserId: auth.actor.id,
        actorRoles: auth.actor.roles,
        targetUserId,
        roles,
      })

      return NextResponse.json({ membership }, { status: 200 })
    }

    const targetUserId =
      body?.userId === null || body?.userId === undefined || body?.userId === ""
        ? null
        : Number(body?.userId)

    if (targetUserId !== null && (!Number.isInteger(targetUserId) || targetUserId <= 0)) {
      return NextResponse.json({ error: "userId inválido para líder" }, { status: 400 })
    }

    const leader = await projectMembershipModule.assignProjectLeader({
      projectId,
      actorUserId: auth.actor.id,
      actorRoles: auth.actor.roles,
      targetUserId,
    })

    return NextResponse.json({ leader }, { status: 200 })
  } catch (error: unknown) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

function resolveAction(body: any, strictAction: boolean): MemberAction | null {
  const action = typeof body?.action === "string" ? (body.action as MemberAction) : null
  if (action && ["add", "remove", "set_roles", "set_leader"].includes(action)) {
    return action
  }

  if (strictAction) return null

  // Compatibilidade com POST legado
  if (body?.membershipId !== undefined) return "remove"
  if (Array.isArray(body?.roles)) return "add"
  return null
}
