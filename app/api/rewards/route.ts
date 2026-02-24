import { NextResponse } from "next/server"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"

const { store: storeModule } = getBackendComposition()
export async function GET() {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const rewards = await storeModule.listRewards();
    return NextResponse.json({ rewards });
  } catch (error: any) {
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
      return new Response(JSON.stringify({ reward: reward.toPrisma() }), { 
        status: 201, 
        headers: { 'Content-Type': 'application/json' } 
      });
    } catch (error: any) {
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
