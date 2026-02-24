import { NextResponse } from 'next/server';
import { createLabOperationsModule } from '@/backend/modules/lab-operations';
import { requireApiActor } from '@/lib/auth/api-guard';
import { getBackendComposition } from "@/backend/composition/root"

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
    console.error("Erro ao buscar eventos:", error);
    return NextResponse.json({ error: error.message || "Erro ao buscar eventos" }, { status: 500 });
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
    console.error("Erro ao criar evento:", error);
    return NextResponse.json({ error: error.message || "Erro ao criar evento" }, { status: 500 });
  }
} 
