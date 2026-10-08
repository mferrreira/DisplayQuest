import { userActor } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard";
import { domainErrorResponse } from "@/lib/api/domain-error-response"
import { getBackendComposition } from "@/backend/composition/root"

// B6-5 (D4): o `hasPermission(MANAGE_WORK_SESSIONS)` que resolvia ESCOPO na rota (gestor ve
// tudo / nao-gestor ve so as proprias / sem gestao com projectId cai no caminho do lider) e o
// `ensureSelfOrPermission` de 403 desceram para o ListWorkSessionsUseCase, lendo o ActorRef.
// A rota mantem apenas a PRIORIDADE DE PARAMETROS (active > userId > status), que e semantica
// de consulta: `status` so e enviado quando `userId` esta ausente (a rota legado nunca mandou
// os dois juntos, e o quirk golden "userId+status invalido" segue valendo para chamadores
// diretos). O 403 do gate e do lider passou a {error, code, details} (superset, DEC-53) com as
// mensagens legadas ("Acesso negado").
const { workExecution: workExecutionModule } = getBackendComposition();

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const projectIdParam = url.searchParams.get("projectId");
    const status = url.searchParams.get("status");
    const active = url.searchParams.get("active");

    if (projectIdParam !== null && (!/^\d+$/.test(projectIdParam) || Number(projectIdParam) <= 0)) {
      return new Response(JSON.stringify({ error: 'projectId inválido' }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const sessions = await workExecutionModule.listWorkSessions({
      actor,
      userId: userId !== null ? Number(userId) : undefined,
      projectId: projectIdParam !== null ? Number(projectIdParam) : undefined,
      status: userId === null && status !== null ? status : undefined,
      activeOnly: active === "true",
    });

    return new Response(JSON.stringify({ data: sessions }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao buscar sessões de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao buscar sessões de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const data = await request.json();
    const targetUserId = Number(data.userId);
    const startTime = typeof data.startTime === "string" ? data.startTime : undefined;
    const endTime = typeof data.endTime === "string" ? data.endTime : undefined;
    const status = typeof data.status === "string" ? data.status : undefined;

    if (!Number.isInteger(targetUserId)) {
      return new Response(JSON.stringify({ error: "userId inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // B6-5: o gate self-ou-gestao (403 "Acesso negado", depois deste 400 de entrada — ordem
    // medida) e o escopo do nome (gestor pede qualquer nome; nao-gestor escreve o proprio)
    // estao no StartWorkSessionUseCase. A rota entrega o nome PEDIDO e o nome da SESSAO.
    const session = await workExecutionModule.startWorkSession({
      actor,
      userId: targetUserId,
      userName: typeof data.userName === "string" ? data.userName : undefined,
      actorName: auth.actor.name ?? undefined,
      activity: data.activity,
      location: data.location,
      projectId: data.projectId,
      startTime,
    });

    const shouldCompleteOnCreate = status === "completed" && Boolean(endTime);
    if (shouldCompleteOnCreate && session?.id) {
      const completedSession = await workExecutionModule.completeWorkSession({
        sessionId: session.id,
        actor,
        activity: data.activity,
        location: data.location,
        endTime,
        projectId: data.projectId,
        dailyLogNote: typeof data.dailyLogNote === "string" ? data.dailyLogNote : undefined,
        dailyLogDate: typeof data.dailyLogDate === "string" ? data.dailyLogDate : undefined,
      });

      return new Response(JSON.stringify({ data: completedSession }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ data: session }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error('Erro ao criar sessão de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao criar sessão de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
