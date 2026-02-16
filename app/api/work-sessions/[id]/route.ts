import { createWorkExecutionModule } from "@/backend/modules/work-execution";
import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard";

const workExecutionModule = createWorkExecutionModule();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const params = await context.params;
    const data = await request.json();
    const id = Number(params.id);
    const existingSession = await workExecutionModule.getSessionById(id);
    if (!existingSession) {
      return new Response(JSON.stringify({ error: "Sessão não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const accessError = ensureSelfOrPermission(actor, existingSession.userId, "MANAGE_WORK_SESSIONS");
    if (accessError) {
      return accessError;
    }
    const completedTaskIds = Array.isArray(data.completedTaskIds)
      ? data.completedTaskIds.map((taskId: unknown) => Number(taskId)).filter((taskId: number) => Number.isInteger(taskId) && taskId > 0)
      : undefined;
    const dailyLogNote = typeof data.dailyLogNote === "string" ? data.dailyLogNote : undefined
    const dailyLogDate = typeof data.dailyLogDate === "string" ? data.dailyLogDate : undefined
    const isCompletionIntent =
      data.status === "completed" ||
      data.endTime !== undefined ||
      data.projectId !== undefined ||
      completedTaskIds !== undefined ||
      dailyLogNote !== undefined ||
      dailyLogDate !== undefined;

    const session = isCompletionIntent
      ? await workExecutionModule.completeWorkSession({
          sessionId: id,
          actorUserId: existingSession.userId,
          activity: data.activity,
          location: data.location,
          endTime: data.endTime,
          projectId: data.projectId,
          completedTaskIds,
          dailyLogNote,
          dailyLogDate,
        })
      : await workExecutionModule.updateWorkSession({
          sessionId: id,
          actorUserId: existingSession.userId,
          activity: data.activity,
          location: data.location,
          status: data.status,
          endTime: data.endTime,
          projectId: data.projectId,
          completedTaskIds,
        });
    
    return new Response(JSON.stringify({ data: session }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error('Erro ao atualizar sessão de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao atualizar sessão de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const params = await context.params;
    const id = Number(params.id);
    const existingSession = await workExecutionModule.getSessionById(id);
    if (!existingSession) {
      return new Response(JSON.stringify({ error: "Sessão não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const accessError = ensureSelfOrPermission(actor, existingSession.userId, "MANAGE_WORK_SESSIONS");
    if (accessError) {
      return accessError;
    }
    
    await workExecutionModule.deleteWorkSession({
      sessionId: id,
      actorUserId: existingSession.userId,
    });
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error('Erro ao excluir sessão de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao excluir sessão de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
} 
