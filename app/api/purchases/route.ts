import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { createStoreModule } from "@/backend/modules/store";

const storeModule = createStoreModule()

// GET: Obter todas as compras
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const rewardId = searchParams.get("rewardId");
    const status = searchParams.get("status");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");
    let purchases;
    
    if (userId) {
      if (!canManagePurchases && Number(userId) !== actor.id) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
      purchases = await storeModule.listPurchases({ userId: Number(userId) });
    } else if (rewardId) {
      purchases = await storeModule.listPurchases({ rewardId: Number(rewardId) });
    } else if (status) {
      purchases = await storeModule.listPurchases({ status });
    } else if (startDate && endDate) {
      purchases = await storeModule.listPurchases({
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      });
    } else if (canManagePurchases) {
      purchases = await storeModule.listPurchases({});
    } else {
      purchases = await storeModule.listPurchases({ userId: actor.id });
    }

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
