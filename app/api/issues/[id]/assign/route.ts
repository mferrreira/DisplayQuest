import { NextResponse } from "next/server";
import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";

const labOperationsModule = createLabOperationsModule();

// POST: Atribuir issue a um usuário
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const issueId = parseInt(params.id);
    const currentIssue = await labOperationsModule.getIssue(issueId);
    if (!currentIssue) {
      return NextResponse.json({ error: "Issue não encontrado" }, { status: 404 });
    }
    const canAssign =
      hasPermission(auth.actor.roles, "MANAGE_USERS") || currentIssue.reporterId === auth.actor.id;
    if (!canAssign) {
      return NextResponse.json({ error: "Sem permissão para atribuir issue" }, { status: 403 });
    }

    const body = await request.json();
    const { assigneeId } = body;

    if (!assigneeId) {
      return NextResponse.json({ error: "assigneeId é obrigatório" }, { status: 400 });
    }

    const issue = await labOperationsModule.assignIssue(issueId, assigneeId);
    return NextResponse.json({ issue });
  } catch (error: any) {
    console.error("Erro ao atribuir issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao atribuir issue" }, { status: 500 });
  }
}
