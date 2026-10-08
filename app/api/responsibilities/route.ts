import { NextResponse } from "next/server"
import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): startResponsibility
// ("Ja existe uma responsabilidade ativa..." -> ConflictError 409; "Usuario nao
// encontrado" -> 404) antes caia no 500 com error.message.
// B6-6 (D4): o gate ensureAnyRole [COORDENADOR, GERENTE, LABORATORISTA] da rota desceu para o
// StartResponsibilityUseCase com a mensagem congelada ("Sem permissão para iniciar
// responsabilidade do laboratório"), ANTES da busca do usuario. assertCanStartResponsibility
// (papéis do BANCO) continua como segunda linha do use case — sessao e banco podem divergir.
// Evolucao medida: o 403 passou a {error, code, details} (superset, DEC-53) mantendo a mensagem.
const { labOperations: labOperationsModule } = getBackendComposition();

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const active = searchParams.get("active")

    if (active === "true") {
      const { activeResponsibility } = await labOperationsModule.listResponsibilities({ activeOnly: true })
      if (activeResponsibility) {
        return NextResponse.json({
          activeResponsibility: activeResponsibility.toJSON()
        }, { status: 200 })
      } else {
        return NextResponse.json({ activeResponsibility: null }, { status: 200 })
      }
    } else if (startDate && endDate) {
      const { responsibilities } = await labOperationsModule.listResponsibilities({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      })
      return NextResponse.json({ 
        responsibilities: (responsibilities || []).map(r => r.toJSON()) 
      }, { status: 200 })
    } else {
      const { responsibilities } = await labOperationsModule.listResponsibilities()
      return NextResponse.json({ 
        responsibilities: (responsibilities || []).map(r => r.toJSON()) 
      }, { status: 200 })
    }
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao buscar responsabilidades:", error)
    return NextResponse.json({ 
      error: error.message || "Erro ao buscar responsabilidades" 
    }, { status: 500 })
  }
}

// POST: Iniciar uma nova responsabilidade
export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const actor = userActor(auth.actor.id, auth.actor.roles);

    const body = await request.json()

    const responsibility = await labOperationsModule.startResponsibility({
      actor,
      actorName: auth.actor.name ?? "Usuário",
      notes: body.notes || "",
    })
    
    return NextResponse.json({ 
      responsibility: responsibility.toJSON() 
    }, { status: 201 })
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao iniciar responsabilidade:", error)
    return NextResponse.json({ 
      error: error.message || "Erro ao iniciar responsabilidade" 
    }, { status: 500 })
  }
}
