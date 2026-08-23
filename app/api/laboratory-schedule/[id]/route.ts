import { NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { labOperations: labOperationsModule } = getBackendComposition();

function toHttpStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  if (message.includes("não tem permissão")) return 403
  if (message.includes("não encontrado")) return 404
  if (message.includes("inválid") || message.includes("Dados inválidos")) return 400
  return 500
}

// PUT: Update a laboratory schedule
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const scheduleId = Number(params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: 'Horário inválido' }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const schedule = await labOperationsModule.updateLaboratorySchedule(scheduleId, {
      ...body,
      userId: auth.actor.id
    });
    
    return NextResponse.json({ schedule: schedule.toJSON() });
  } catch (error: any) {
    console.error('Erro ao atualizar horário do laboratório:', error);
    return NextResponse.json({
      error: error.message || 'Erro ao atualizar horário do laboratório'
    }, { status: toHttpStatus(error) });
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
    const scheduleId = Number(params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return NextResponse.json({ error: 'Horário inválido' }, { status: 400 });
    }

    await labOperationsModule.deleteLaboratorySchedule({
      scheduleId,
      userId: auth.actor.id
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro ao excluir horário do laboratório:', error);
    return NextResponse.json({
      error: error.message || 'Erro ao excluir horário do laboratório'
    }, { status: toHttpStatus(error) });
  }
}
