import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { resolvePurchaseQueryScope } from "@/backend/modules/store/application/purchase-query-scope"

const { store: storeModule } = getBackendComposition()
// GET: Obter todas as compras
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");

    const scope = resolvePurchaseQueryScope({
      actorId: actor.id,
      canManagePurchases,
      userId: searchParams.get("userId"),
      rewardId: searchParams.get("rewardId"),
      status: searchParams.get("status"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });
    if (scope.deny) {
      return NextResponse.json({ error: scope.message }, { status: 403 });
    }

    const purchases = await storeModule.listPurchases(scope.query);

    return NextResponse.json({ purchases });
  } catch (error: any) {
    console.error('Erro ao buscar compras:', error);
    return NextResponse.json({ error: 'Erro ao buscar compras', details: error?.message }, { status: 500 });
  }
}

// POST: Criar uma nova compra (resgatar recompensa)
export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");
    const data = await request.json();
    const targetUserId = Number(data.userId);

    if (!Number.isInteger(targetUserId)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    if (!canManagePurchases && targetUserId !== actor.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const purchase = await storeModule.createPurchase(data);
    return NextResponse.json({ purchase }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar compra:', error);
    return NextResponse.json({ error: 'Erro ao criar compra', details: error?.message }, { status: 500 });
  }
}
