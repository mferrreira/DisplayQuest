import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard";
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { getBackendComposition } from "@/backend/composition/root"

// B6-5 (D4): o pre-lookup `getSessionById` + `ensureSelfOrPermission` da rota SAIU — os use
// cases complete/update/delete ja decidiam a MESMA regra (lookup 404 -> gate 403) com as
// mensagens proprias ("Não autorizado a atualizar/excluir esta sessão"). O gate da rota era
// um duplicado com o default "Acesso negado"; removido, a mensagem do use case virou fonte
// unica (evolucão medida, mesma classe da DEC-118). O 404 de sessao ausente passou de corpo
// manual para NotFoundError mapeado: {error, code, details} (superset, DEC-53).
const { workExecution: workExecutionModule } = getBackendComposition();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const data = await request.json();
    const id = Number(params.id);

    const completedTaskIds = Array.isArray(data.completedTaskIds)
      ? data.completedTaskIds.map((taskId: unknown) => Number(taskId)).filter((taskId: number) => Number.isInteger(taskId) && taskId > 0)
      : undefined;
    const dailyLogNote = typeof data.dailyLogNote === "string" ? data.dailyLogNote : undefined
    const dailyLogDate = typeof data.dailyLogDate === "string" ? data.dailyLogDate : undefined
    // OND3-B3: the "completion intent" heuristic (endTime/projectId/completedTaskIds/
    // dailyLogNote/dailyLogDate presence triggering completion) is GONE — the route dispatches
    // on the explicit status. Completion (with daily-log upsert + gamification events) is
    // status === "completed"; everything else is updateWorkSession, whose completion branch is
    // server-authoritative (an endTime in the payload still closes the session at the server
    // clock, frozen by the golden matrix).
    const session = data.status === "completed"
      ? await workExecutionModule.completeWorkSession({
          sessionId: id,
          actor,
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
          actor,
          activity: data.activity,
          location: data.location,
          status: data.status,
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration,
          projectId: data.projectId,
          completedTaskIds,
        });

    return new Response(JSON.stringify({ data: session }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
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

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const id = Number(params.id);

    await workExecutionModule.deleteWorkSession({
      sessionId: id,
      actor,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao excluir sessão de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao excluir sessão de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
