import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition();

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("não tem permissão")) return 403
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

export async function GET() {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const schedules = await labOperationsModule.listLaboratorySchedules();
    return NextResponse.json({ 
      schedules: schedules.map(schedule => schedule.toJSON()) 
    });
  } catch (error: any) {
    console.error('Erro ao buscar horários do laboratório:', error);
    return NextResponse.json({ 
      error: error.message || 'Erro ao buscar horários do laboratório' 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    let data: any;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const schedule = await labOperationsModule.createLaboratorySchedule({
      ...data,
      userId: auth.actor.id
    });
    
    return NextResponse.json({ schedule: schedule.toJSON() }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar horário do laboratório:', error);
    const message = error instanceof Error ? error.message : 'Erro ao criar horário do laboratório';
    return NextResponse.json({
      error: message
    }, { status: toHttpStatus(error) });
  }
} 
