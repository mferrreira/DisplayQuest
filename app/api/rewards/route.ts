import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados por domainErrorResponse. EVOLUTIONS (documentadas):
//  - POST create: validacao antes caia no 400 {error:'Erro ao criar recompensa',details};
//    agora ValidationError -> 400 {error:<msg>,code,details} (mensagens pinadas no contract 8.3).
const { store: storeModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const rewards = await storeModule.listRewards();
    return NextResponse.json({ rewards });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao buscar recompensas:', error);
    return NextResponse.json({ error: 'Erro ao buscar recompensas', details: error?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
    try {
      const auth = await requireApiActor();
      if (auth.error) return auth.error;
      const deny = ensurePermission(auth.actor, "MANAGE_REWARDS");
      if (deny) return deny;

      const data = await request.json();
      const reward = await storeModule.createReward(data);
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
