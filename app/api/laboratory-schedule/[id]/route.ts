import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition();

// PUT: Update a laboratory schedule
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const body = await request.json();
    
    const schedule = await labOperationsModule.updateLaboratorySchedule(Number(params.id), {
      ...body,
      userId: auth.actor.id
    });
    
    return NextResponse.json({ schedule: schedule.toJSON() });
  } catch (error: any) {
    console.error('Erro ao atualizar horário do laboratório:', error);
    return NextResponse.json({ 
      error: error.message || 'Erro ao atualizar horário do laboratório' 
    }, { status: 500 });
  }
}

// DELETE: Delete a laboratory schedule
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    await labOperationsModule.deleteLaboratorySchedule(Number(params.id));
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir horário do laboratório:', error);
    return NextResponse.json({ 
      error: error.message || 'Erro ao excluir horário do laboratório' 
    }, { status: 500 });
  }
} 
