import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao listar avisos:", error)
    return NextResponse.json({ error: error.message || "Erro ao listar avisos" }, { status: 500 })
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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar aviso:", error)
    return NextResponse.json({ error: error.message || "Erro ao criar aviso" }, { status: 500 })
  }
}
