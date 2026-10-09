import { NextResponse } from 'next/server';
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from '@/lib/auth/api-guard';
import { getBackendComposition } from "@/backend/composition/root"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): createLabEvent com
// validacao ("Dados invalidos: ...") ou usuario inativo/inexistente antes caia no 500 com
// error.message; agora ValidationError -> 400, NotFoundError -> 404, ForbiddenError -> 403.
const { labOperations: labOperationsModule } = getBackendComposition();

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const day = searchParams.get('day');
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    
    if (!day || !month || !year) {
      return NextResponse.json({ error: 'day, month e year são obrigatórios' }, { status: 400 });
    }
    
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const events = await labOperationsModule.listLabEventsByDate(date);
    
    return NextResponse.json({ events: events.map(event => event.toJSON()) });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar eventos", exposeMessage: true })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;
    
    const body = await request.json();
    const { date, note } = body;
    
    if (!date || !note) {
      return NextResponse.json({ error: 'date e note são obrigatórios' }, { status: 400 });
    }
    
    const event = await labOperationsModule.createLabEvent({
      userId: auth.actor.id,
      userName: auth.actor.name ?? 'Usuário',
      date: new Date(date),
      note,
    });
    
    return NextResponse.json({ event: event.toJSON() }, { status: 201 });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao criar evento", exposeMessage: true })
  }
} 
