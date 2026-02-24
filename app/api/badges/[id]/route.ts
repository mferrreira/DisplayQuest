import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { gamification: gamificationModule } = getBackendComposition()
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    const badge = await gamificationModule.getBadgeById(id)
    if (!badge) {
      return NextResponse.json({ error: "Badge não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ badge })
  } catch (error) {
    console.error("Erro ao buscar badge:", error)
    return NextResponse.json({ error: "Erro ao buscar badge" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS", "Sem permissão para atualizar badges")
    if (deny) return deny

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    const body = await request.json()
    const badge = await gamificationModule.updateBadge({ id, data: body })
    return NextResponse.json({ badge })
  } catch (error: any) {
    console.error("Erro ao atualizar badge:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar badge" }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS", "Sem permissão para excluir badges")
    if (deny) return deny

    const params = await context.params
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Badge inválido" }, { status: 400 })
    }

    await gamificationModule.deleteBadge(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Erro ao excluir badge:", error)
    return NextResponse.json({ error: error.message || "Erro ao excluir badge" }, { status: 500 })
  }
}
