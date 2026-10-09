import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): createLabNotice
// ("Aviso e obrigatorio" / usuario inativo/inexistente) antes caia no 500 com error.message;
// agora ValidationError -> 400, NotFoundError -> 404, ForbiddenError -> 403.
const { labOperations: labOperationsModule } = getBackendComposition()

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const notices = await labOperationsModule.listLabNotices()

    return NextResponse.json({
      notices: notices.map((notice) => notice.toJSON()),
    })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao listar avisos", exposeMessage: true })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const body = await request.json()
    const notice = await labOperationsModule.createLabNotice({
      userId: auth.actor.id,
      userName: auth.actor.name ?? "Usuario",
      note: body?.note,
    })

    return NextResponse.json({ notice: notice.toJSON() }, { status: 201 })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao criar aviso", exposeMessage: true })
  }
}
