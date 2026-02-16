import { createWorkExecutionModule } from "@/backend/modules/work-execution";
import { ensurePermission, ensureSelfOrPermission, requireApiActor } from "@/lib/auth/api-guard";

const workExecutionModule = createWorkExecutionModule();

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = auth.actor;
    const canManageSessions = !ensurePermission(actor, "MANAGE_WORK_SESSIONS");
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const status = url.searchParams.get("status");
    const active = url.searchParams.get("active");
    
    let sessions;
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
    const canManageSessions = !ensurePermission(actor, "MANAGE_WORK_SESSIONS");
    const data = await request.json();
    const targetUserId = Number(data.userId);

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
    });
    
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
