import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

// B6-2a (D4, DEC-53): os três gates de MANAGE_REWARDS (PUT/PATCH/DELETE) desceram para os use
// cases de reward. A rota legacy passava `ensurePermission(actor, "MANAGE_REWARDS")` SEM
// mensagem — daí o 403 continuar sendo "Acesso negado", agora vindo de ForbiddenError no domínio.
// Nada de validação de id havia entre o gate e a chamada nesta rota, então nenhuma regra precisou
// se mover junto (ao contrário de /api/badges/[id]).
// GET é leitura de catálogo: exige sessão, não exige permissão.
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTIONS (documentadas, DEC-23):
//  - PUT/PATCH rewards ANTES explodiam SEMPRE (QUIRK-8S1 -> 500 'Unknown argument categoryId');
//    agora FUNCIONAM (adapter escreve so colunas reais) e validacao -> 400 ValidationError.
//  - DELETE inexistente: antes 500 com details 'Recompensa nao encontrada'; agora 404.
const { store: storeModule } = getBackendComposition()
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const reward = await storeModule.getReward(Number(params.id));
    if (!reward) {
      return NextResponse.json({ error: "Recompensa não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ reward });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao buscar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao buscar recompensa', details: error?.message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const params = await context.params;
    const data = await request.json();
    const reward = await storeModule.updateReward({
      actorRoles: auth.actor.roles,
      rewardId: Number(params.id),
      data,
    });
    return NextResponse.json({ reward });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao atualizar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao atualizar recompensa', details: error?.message }, { status: 500 });
  }
}

// PATCH: Atualizar campos específicos de uma recompensa
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const params = await context.params;
    const data = await request.json();
    const { action, ...updateData } = data;
    const reward = await storeModule.patchReward({
      actorRoles: auth.actor.roles,
      rewardId: Number(params.id),
      action,
      updateData,
    });

    return NextResponse.json({ reward });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao atualizar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao atualizar recompensa', details: error?.message }, { status: 500 });
  }
}

// DELETE: Excluir uma recompensa
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const params = await context.params;
    await storeModule.deleteReward({
      actorRoles: auth.actor.roles,
      rewardId: Number(params.id),
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao excluir recompensa:', error);
    return NextResponse.json({ error: 'Erro ao excluir recompensa', details: error?.message }, { status: 500 });
  }
}
