import { NextRequest, NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
const { userManagement: userManagementModule } = getBackendComposition()
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const userId = Number(params.id)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "ID do usuário inválido" }, { status: 400 })
    }

    const body = await request.json()
    const hours = Number(body?.hours)
    const reason = typeof body?.reason === "string" ? body.reason : ""
    const projectId = body?.projectId !== undefined && body?.projectId !== null ? Number(body.projectId) : undefined

    if (!Number.isFinite(hours) || hours <= 0) {
      return NextResponse.json({ error: "Quantidade de horas inválida" }, { status: 400 })
    }

    if (!reason.trim()) {
      return NextResponse.json({ error: "Motivo é obrigatório" }, { status: 400 })
    }

    const result = await userManagementModule.deductUserHours({
      userId,
      hours,
      reason,
      projectId,
      deductedBy: auth.actor.id,
      deductedByRoles: auth.actor.roles,
    })

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error("Erro ao retirar horas:", error)
    return NextResponse.json({ error: "Erro ao retirar horas" }, { status: 500 })
  }
}
