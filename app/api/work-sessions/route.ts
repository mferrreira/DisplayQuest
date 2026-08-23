import { ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac"
import { getBackendComposition } from "@/backend/composition/root"

const { workExecution: workExecutionModule } = getBackendComposition();

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManageSessions = hasPermission(actor.roles, "MANAGE_WORK_SESSIONS");
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

    let sessions;

    if (projectIdParam !== null) {
      const targetProjectId = Number(projectIdParam);
      if (!canManageSessions && actor.id !== undefined) {
        try {
          const result = await workExecutionModule.listProjectLogsForLeader({
            leaderId: actor.id,
            projectId: targetProjectId,
          });
          if (result.ledProjectIds.length === 0) {
            return new Response(JSON.stringify({ error: 'Acesso negado' }), {
              status: 403,
              headers: { "Content-Type": "application/json" }
            });
          }
          const filteredByUser = userId
            ? result.sessions.filter((s: any) => s.userId === Number(userId))
            : result.sessions;
          return new Response(JSON.stringify({ data: filteredByUser }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        } catch (error: any) {
          const message = error?.message || "";
          return new Response(JSON.stringify({ error: message.includes('Acesso negado') ? 'Acesso negado' : 'Erro ao buscar sessões de trabalho' }), {
            status: message.includes('Acesso negado') ? 403 : 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      }
      sessions = await workExecutionModule.listWorkSessions({});
      sessions = (sessions as any[]).filter((s: any) => s.projectId === targetProjectId);
      return new Response(JSON.stringify({ data: sessions }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const targetUserId = userId ? Number(userId) : actor.id;

    const accessError = ensureSelfOrPermission(actor, targetUserId, "MANAGE_WORK_SESSIONS");
    if (accessError) {
      return accessError;
    }

    if (active === "true") {
      sessions = canManageSessions
        ? await workExecutionModule.listWorkSessions({ status: "active" })
        : await workExecutionModule.listWorkSessions({ userId: actor.id });
    } else if (userId || !canManageSessions) {
      sessions = await workExecutionModule.listWorkSessions({ userId: targetUserId });
    } else if (status) {
      sessions = canManageSessions
        ? await workExecutionModule.listWorkSessions({ status })
        : await workExecutionModule.listWorkSessions({ userId: actor.id });
    } else {
      sessions = canManageSessions
        ? await workExecutionModule.listWorkSessions({})
        : await workExecutionModule.listWorkSessions({ userId: actor.id });
    }
    
    return new Response(JSON.stringify({ data: sessions }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
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

    const actor = auth.actor;
    const canManageSessions = hasPermission(actor.roles, "MANAGE_WORK_SESSIONS");
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

    const accessError = ensureSelfOrPermission(actor, targetUserId, "MANAGE_WORK_SESSIONS");
    if (accessError) {
      return accessError;
    }

    const session = await workExecutionModule.startWorkSession({
      userId: targetUserId,
      userName: canManageSessions ? String(data.userName || actor.name || "") : String(actor.name || ""),
      activity: data.activity,
      location: data.location,
      projectId: data.projectId,
      startTime,
      actorRoles: actor.roles,
    });

    const shouldCompleteOnCreate = status === "completed" && Boolean(endTime);
    if (shouldCompleteOnCreate && session?.id) {
      const completedSession = await workExecutionModule.completeWorkSession({
        sessionId: session.id,
        actorUserId: targetUserId,
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
    console.error('Erro ao criar sessão de trabalho:', error);
    return new Response(JSON.stringify({ error: 'Erro ao criar sessão de trabalho', details: error?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
} 
