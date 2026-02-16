import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { createStoreModule } from "@/backend/modules/store";

const storeModule = createStoreModule()

// GET: Obter uma compra específica
export async function GET(context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");
    const params = await context.params;
    const purchase = await storeModule.getPurchase(Number(params.id));
    if (!purchase) {
      return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
    }
    if (!canManagePurchases && purchase.userId !== actor.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
    return NextResponse.json({ purchase });
  } catch (error: any) {
    console.error('Erro ao buscar compra:', error);
    return NextResponse.json({ error: 'Erro ao buscar compra', details: error?.message }, { status: 500 });
  }
}

// PUT: Atualizar uma compra
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");
    if (!canManagePurchases) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const params = await context.params;
    const data = await request.json();
    const purchase = await storeModule.updatePurchase(Number(params.id), data);
    return NextResponse.json({ purchase });
  } catch (error: any) {
    console.error('Erro ao atualizar compra:', error);
    return NextResponse.json({ error: 'Erro ao atualizar compra', details: error?.message }, { status: 500 });
  }
}

// PATCH: Aprovar, rejeitar, completar ou cancelar uma compra
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");

    const params = await context.params;
    const body = await request.json();
    const { action, ...updateData } = body;

    const purchaseId = Number(params.id);
    const existingPurchase = await storeModule.getPurchase(purchaseId);
    if (!existingPurchase) {
      return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
    }

    if (action === "cancel") {
      if (!canManagePurchases && existingPurchase.userId !== actor.id) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    } else if (!canManagePurchases) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const purchase = await storeModule.patchPurchase({
      purchaseId: Number(params.id),
      action,
      updateData,
    });

    return NextResponse.json({ purchase });
  } catch (error: any) {
    console.error('Erro ao atualizar compra:', error);
    return NextResponse.json({ error: 'Erro ao atualizar compra', details: error?.message }, { status: 500 });
  }
}

// DELETE: Excluir uma compra
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");
    if (!canManagePurchases) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const params = await context.params;
    await storeModule.deletePurchase(Number(params.id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir compra:', error);
    return NextResponse.json({ error: 'Erro ao excluir compra', details: error?.message }, { status: 500 });
  }
}
