import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard";
import { userActor } from "@/backend/domain";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados por domainErrorResponse; a RESOLUCAO DE ESCOPO (A2)
// vive no use case ListPurchases. B6-2d (D4): a rota parou de calcular o veredito
// `canManagePurchases` com hasPermission — entrega o ActorRef e o use case decide. O deny
// devolve o corpo 403 legado EXATO { error: "Acesso negado" } (resolucao de escopo, nao gate).
// EVOLUTION (documentada): createPurchase ("Usuario nao encontrado" / "Recompensa nao
// encontrada" / "Pontos insuficientes...") antes caia no 500 com details; agora NotFoundError
// -> 404 e ValidationError -> 400 (mensagens pinadas no contract 8.3).
// B6-2d: o gate cross-actor de POST (comprar PARA OUTRO exige MANAGE_PURCHASES) desceu para
// CreatePurchaseUseCase. A validacao "userId inválido" FICA na rota: a ordem medida (B6-0) e
// 400 antes do 403, e ela e validacao de entrada, nao autorizacao — mover para o use case
// mudaria o corpo do 400 (ValidationError mapeado ganha code), o que o contrato do B6 nao cobre.
const { store: storeModule } = getBackendComposition()
// GET: Obter todas as compras
export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const actor = userActor(auth.actor.id, auth.actor.roles);

    const result = await storeModule.listPurchases({
      actor,
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
    return routeErrorResponse(error, { fallback: "Erro ao buscar compras", details: true })
  }
}

// POST: Criar uma nova compra (resgatar recompensa)
export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const data = await request.json();
    const targetUserId = Number(data.userId);

    if (!Number.isInteger(targetUserId)) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 });
    }

    // Gate cross-actor (DEC-115 self-or-manage): comprar para si e sempre permitido; comprar
    // PARA OUTRO exige MANAGE_PURCHASES. A decisao mora no use case (B6-2d).
    const purchase = await storeModule.createPurchase({ actor, data });
    return NextResponse.json({ purchase }, { status: 201 });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao criar compra", details: true })
  }
}
