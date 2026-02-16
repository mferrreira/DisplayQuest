import { NextResponse } from "next/server"
import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import { ensureAnyRole, requireApiActor } from "@/lib/auth/api-guard";

const labOperationsModule = createLabOperationsModule();

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
    const deny = ensureAnyRole(
      auth.actor,
      ["COORDENADOR", "GERENTE", "LABORATORISTA"],
      "Sem permissão para iniciar responsabilidade do laboratório",
    );
    if (deny) return deny;

    const body = await request.json()

    const responsibility = await labOperationsModule.startResponsibility({
      actorUserId: auth.actor.id,
      actorName: auth.actor.name ?? "Usuário",
      notes: body.notes || "",
    })
    
    return NextResponse.json({ 
      responsibility: responsibility.toJSON() 
    }, { status: 201 })
  } catch (error: any) {
    console.error("Erro ao iniciar responsabilidade:", error)
    return NextResponse.json({ 
      error: error.message || "Erro ao iniciar responsabilidade" 
    }, { status: 500 })
  }
}
