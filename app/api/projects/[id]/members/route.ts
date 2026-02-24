import { NextResponse } from "next/server"
import type { UserRole } from "@prisma/client"
import { requireApiActor } from "@/lib/auth/api-guard"
import { normalizeRoles } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"

const { projectMembership: projectMembershipModule } = getBackendComposition()
type MemberAction = "add" | "remove" | "set_roles" | "set_leader"

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Não autorizado")) return 401
  if (message.includes("Acesso negado") || message.includes("Apenas")) return 403
  if (message.includes("não encontrado")) return 404
  if (
    message.includes("obrigatórios") ||
    message.includes("já é membro") ||
    message.includes("Nenhum papel válido") ||
    message.includes("já é líder de outro projeto") ||
    message.includes("último gerente")
  ) {
    return 400
  }
  return 500
}

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
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    console.error("Erro na API de membros do projeto:", error)
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
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
      const roles = normalizeRoles(body?.roles) as UserRole[]
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
      const roles = normalizeRoles(body?.roles) as UserRole[]
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
    const message = error instanceof Error ? error.message : "Erro interno do servidor"
    console.error("Erro na API de membros do projeto (mutação):", error)
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
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
