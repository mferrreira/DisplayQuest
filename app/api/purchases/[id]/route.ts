import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard";
import { userActor } from "@/backend/domain";
import { getBackendComposition } from "@/backend/composition/root"

// B6-2d (D4): as quatro metodos pararam de decidir autorizacao na rota (hasPermission +
// comparacoes de userId). A autoridade mora nos use cases de purchase, com as ORDENS medidas
// preservadas: GET 404->403 (self-or-manage); PUT/DELETE 403->404 (gate puro antes da leitura);
// PATCH 404->gate por acao (cancel self-or-manage, demais MANAGE_PURCHASES puro)->400/409.
// O PUT chama assertCanManagePurchases ANTES de ler o corpo: o gate legado vinha antes do
// parse, e um corpo invalido para quem nao tem permissao deve seguir devolvendo 403, nao 500
// (mesmo padrao do AssertCanPublishNotificationEventUseCase, B6-2b). updatePurchase recheca.
const { store: storeModule } = getBackendComposition()
// GET: Obter uma compra específica
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const purchase = await storeModule.getPurchase(actor, Number(params.id));
    if (!purchase) {
      return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ purchase });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar compra" })
  }
}

// PUT: Atualizar uma compra
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    storeModule.assertCanManagePurchases({ actor });

    const params = await context.params;
    const data = await request.json();
    const purchase = await storeModule.updatePurchase({ actor, purchaseId: Number(params.id), data });
    return NextResponse.json({ purchase });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar compra" })
  }
}

// PATCH: Aprovar, rejeitar, completar ou cancelar uma compra
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);

    const params = await context.params;
    const body = await request.json();
    const { action, ...updateData } = body;

    const purchase = await storeModule.patchPurchase({
      actor,
      purchaseId: Number(params.id),
      action,
      updateData,
    });

    return NextResponse.json({ purchase });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar compra" })
  }
}

// DELETE: Excluir uma compra
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    await storeModule.deletePurchase({ actor, purchaseId: Number(params.id) });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao excluir compra" })
  }
}
