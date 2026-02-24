import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"

const { store: storeModule } = getBackendComposition()
export async function GET(context: { params: Promise<{ id: string }> }) {
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
    console.error('Erro ao buscar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao buscar recompensa', details: error?.message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS");
    if (deny) return deny;

    const params = await context.params;
    const data = await request.json();
    const reward = await storeModule.updateReward(Number(params.id), data);
    return NextResponse.json({ reward });
  } catch (error: any) {
    console.error('Erro ao atualizar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao atualizar recompensa', details: error?.message }, { status: 500 });
  }
}

// PATCH: Atualizar campos específicos de uma recompensa
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS");
    if (deny) return deny;

    const params = await context.params;
    const data = await request.json();
    const { action, ...updateData } = data;
    const reward = await storeModule.patchReward({
      rewardId: Number(params.id),
      action,
      updateData,
    });

    return NextResponse.json({ reward });
  } catch (error: any) {
    console.error('Erro ao atualizar recompensa:', error);
    return NextResponse.json({ error: 'Erro ao atualizar recompensa', details: error?.message }, { status: 500 });
  }
}

// DELETE: Excluir uma recompensa
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    const deny = ensurePermission(auth.actor, "MANAGE_REWARDS");
    if (deny) return deny;

    const params = await context.params;
    await storeModule.deleteReward(Number(params.id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir recompensa:', error);
    return NextResponse.json({ error: 'Erro ao excluir recompensa', details: error?.message }, { status: 500 });
  }
}
