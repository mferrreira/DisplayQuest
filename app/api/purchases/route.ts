import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados por domainErrorResponse; a RESOLUCAO DE ESCOPO (A2)
// agora vive no use case ListPurchases (task OND8-B2 da allow-list — a rota nao importa
// mais caminho interno do modulo). O deny devolve o corpo 403 legado EXATO { error: "Acesso negado" }.
// EVOLUTION (documentada): createPurchase ("Usuario nao encontrado" / "Recompensa nao
// encontrada" / "Pontos insuficientes...") antes caia no 500 com details; agora NotFoundError
// -> 404 e ValidationError -> 400 (mensagens pinadas no contract 8.3).
const { store: storeModule } = getBackendComposition()
// GET: Obter todas as compras
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const actor = auth.actor;
    const canManagePurchases = hasPermission(actor.roles, "MANAGE_PURCHASES");

    const result = await storeModule.listPurchases({
      actorId: actor.id,
      canManagePurchases,
      userId: searchParams.get("userId"),
      rewardId: searchParams.get("rewardId"),
      status: searchParams.get("status"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });
    if (result.denied) {
      return NextResponse.json({ error: result.message }, { status: 403 });
    }

    return NextResponse.json({ purchases: result.purchases });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
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
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao criar compra:', error);
    return NextResponse.json({ error: 'Erro ao criar compra', details: error?.message }, { status: 500 });
  }
}
