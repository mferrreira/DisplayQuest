import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTIONS (documentadas):
//  - POST create: validacao antes caia no 400 {error:'Erro ao criar recompensa',details};
//    agora ValidationError -> 400 {error:<msg>,code,details} (mensagens pinadas no contract 8.3).
// B6-2a (D4, DEC-53): o gate de MANAGE_REWARDS do POST desceu para o CreateRewardUseCase. A rota
// passava `ensurePermission(actor, "MANAGE_REWARDS")` SEM mensagem, e por isso o 403 continua
// sendo o "Acesso negado" default — agora lançado pelo domínio.
// O GET exige sessão mas nenhuma permissão: leitura de catálogo, não é autorização.
const { store: storeModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const rewards = await storeModule.listRewards();
    return NextResponse.json({ rewards });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar recompensas", details: true })
  }
}

export async function POST(request: Request) {
    try {
      const auth = await requireApiActor();
      if (auth.error) return auth.error;
      const data = await request.json();
      const reward = await storeModule.createReward({
        actorRoles: auth.actor.roles,
        data,
      });
      // OND8-B3: o record agora e um objeto plain (o adapter devolve a forma JSON);
      // reward.toPrisma() legado produzia exatamente estes campos — body identico.
      return new Response(JSON.stringify({ reward }), { 
        status: 201, 
        headers: { 'Content-Type': 'application/json' } 
      });
    } catch (error: any) {
      const mapped = domainErrorResponse(error);
      if (mapped) return mapped;
      console.error('Erro ao criar recompensa:', error);
      return new Response(JSON.stringify({ 
        error: 'Erro ao criar recompensa', 
        details: error?.message 
      }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
}
