import { NextResponse } from "next/server"
import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados; heuristic legado (toHttpStatus) como fallback.
// EVOLUTION: "Usuario nao encontrado" (create) antes 500 -> agora 404.
const { labOperations: labOperationsModule } = getBackendComposition()
function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("Acesso negado")) return 403
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const userIdParam = searchParams.get("userId")
    const targetUserId = userIdParam ? Number(userIdParam) : undefined

    if (userIdParam && (!Number.isInteger(targetUserId) || targetUserId! <= 0)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const schedules = await labOperationsModule.listUserSchedules({
      actor: userActor(auth.actor.id, auth.actor.roles),
      targetUserId,
    })

    return NextResponse.json({
      schedules: schedules.map((schedule: any) => schedule.toJSON()),
    })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar horários:", error)
    const message = error instanceof Error ? error.message : "Erro ao buscar horários"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const raw = await request.text()
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const targetUserId = data?.userId ? Number(data.userId) : auth.actor.id

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }

    const schedule = await labOperationsModule.createUserSchedule({
      actor: userActor(auth.actor.id, auth.actor.roles),
      targetUserId,
      dayOfWeek: Number(data?.dayOfWeek),
      startTime: data?.startTime,
      endTime: data?.endTime,
    })

    return NextResponse.json({
      schedule: (schedule as any).toJSON(),
    }, { status: 201 })
  } catch (error: unknown) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar horário:", error)
    const message = error instanceof Error ? error.message : "Erro ao criar horário"
    return NextResponse.json({ error: message }, { status: toHttpStatus(error) })
  }
}
