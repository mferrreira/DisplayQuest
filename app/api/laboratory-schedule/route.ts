import { NextResponse } from "next/server"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"
import { requireApiActor } from "@/lib/auth/api-guard"

const labOperationsModule = createLabOperationsModule();

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

    const data = await request.json();
    
    const schedule = await labOperationsModule.createLaboratorySchedule({
      ...data,
      userId: auth.actor.id
    });
    
    return NextResponse.json({ schedule: schedule.toJSON() }, { status: 201 });
  } catch (error: any) {
    console.error('Erro ao criar horário do laboratório:', error);
    return NextResponse.json({ 
      error: error.message || 'Erro ao criar horário do laboratório' 
    }, { status: 500 });
  }
} 
