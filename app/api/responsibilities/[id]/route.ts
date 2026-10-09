import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): "Responsabilidade nao
// encontrada" -> 404 (antes 500), "Responsabilidade ja foi finalizada" -> 409 (antes 500),
// "Dados invalidos: ..." -> 400 (antes 500).
// B6-6 (D4): os pre-checks da rota sairam. `canEndResponsibility` (antes chamado pela rota) passou
// para dentro de end/updateNotes na MESMA ordem medida (canEnd antes do lookup — responsabilidade
// ausente responde 403, nao 404) com as mensagens congeladas da rota ("Apenas o laboratorista
// atual ou um administrador pode encerrar a responsabilidade" / "Sem permissão para atualizar
// notas desta responsabilidade"). O gate ensureAnyRole do DELETE desceu para o
// DeleteResponsibilityUseCase ("Sem permissão para excluir responsabilidade", antes do lookup).
// pause/resume: self-only para pessoa; o cron opera como system (SCHEDULED_PAUSE, DEC-54).
// Evolucao medida: 403/404/409 passaram ao corpo mapeado {error, code, details} (superset,
// DEC-53) mantendo as mensagens.
const { labOperations: labOperationsModule } = getBackendComposition();

// PATCH: Encerrar uma responsabilidade ou atualizar notas
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params
    const id = parseInt(params.id)
    const body = await request.json()

    if (body.action === "end") {
      const responsibility = await labOperationsModule.endResponsibility({
        actor,
        responsibilityId: id,
        notes: body.notes,
      });
      return NextResponse.json({ responsibility: responsibility.toJSON() }, { status: 200 });
    } else if (body.action === "updateNotes" && body.notes !== undefined) {
      const responsibility = await labOperationsModule.updateResponsibilityNotes({
        actor,
        responsibilityId: id,
        notes: body.notes,
      });
      return NextResponse.json({ responsibility: responsibility.toJSON() }, { status: 200 });
    } else if (body.action === "pause") {
      const paused = await labOperationsModule.pauseResponsibilityForUser({ actor, userId: auth.actor.id });
      return NextResponse.json({ responsibility: paused?.toJSON() ?? null }, { status: 200 });
    } else if (body.action === "resume") {
      const resumed = await labOperationsModule.resumeResponsibilityForUser({ actor, userId: auth.actor.id });
      return NextResponse.json({ responsibility: resumed?.toJSON() ?? null }, { status: 200 });
    }

    return NextResponse.json({ error: "Ação não suportada" }, { status: 400 })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar responsabilidade", exposeMessage: true })
  }
}

// DELETE: Excluir uma responsabilidade
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const actor = userActor(auth.actor.id, auth.actor.roles);

    const params = await context.params
    const id = parseInt(params.id)

    await labOperationsModule.deleteResponsibility({ actor, responsibilityId: id });
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao excluir responsabilidade", exposeMessage: true })
  }
}
