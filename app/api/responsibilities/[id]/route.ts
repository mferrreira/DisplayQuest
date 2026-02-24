import { NextResponse } from "next/server"
import { ensureAnyRole, requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition();

// PATCH: Encerrar uma responsabilidade ou atualizar notas
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params
    const id = parseInt(params.id)
    const body = await request.json()

    if (body.action === "end") {
      // Check if user can end this responsibility
      const canEnd = await labOperationsModule.canEndResponsibility(auth.actor.id, id);
      if (!canEnd) {
        return NextResponse.json({ 
          error: "Apenas o laboratorista atual ou um administrador pode encerrar a responsabilidade" 
        }, { status: 403 });
      }

      const responsibility = await labOperationsModule.endResponsibility(id, body.notes);
      return NextResponse.json({ responsibility: responsibility.toJSON() }, { status: 200 });
    } else if (body.action === "updateNotes" && body.notes !== undefined) {
      const canUpdate = await labOperationsModule.canEndResponsibility(auth.actor.id, id);
      if (!canUpdate) {
        return NextResponse.json(
          { error: "Sem permissão para atualizar notas desta responsabilidade" },
          { status: 403 },
        );
      }
      const responsibility = await labOperationsModule.updateResponsibilityNotes(id, auth.actor.id, body.notes);
      return NextResponse.json({ responsibility: responsibility.toJSON() }, { status: 200 });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 })
  } catch (error: any) {
    console.error("Erro ao atualizar responsabilidade:", error)
    return NextResponse.json({ 
      error: error.message || "Erro ao atualizar responsabilidade" 
    }, { status: 500 })
  }
}

// DELETE: Excluir uma responsabilidade
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const deny = ensureAnyRole(
      auth.actor,
      ["COORDENADOR", "GERENTE", "LABORATORISTA"],
      "Sem permissão para excluir responsabilidade",
    );
    if (deny) return deny;

    const params = await context.params
    const id = parseInt(params.id)

    await labOperationsModule.deleteResponsibility(id);
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error("Erro ao excluir responsabilidade:", error)
    return NextResponse.json({ 
      error: error.message || "Erro ao excluir responsabilidade" 
    }, { status: 500 })
  }
}
