import { NextResponse } from "next/server";
import { createLabOperationsModule } from "@/backend/modules/lab-operations";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";

const labOperationsModule = createLabOperationsModule();

// POST: Resolver um issue
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
    const canResolve =
      hasPermission(auth.actor.roles, "MANAGE_USERS") ||
      currentIssue.reporterId === auth.actor.id ||
      currentIssue.assigneeId === auth.actor.id;
    if (!canResolve) {
      return NextResponse.json({ error: "Sem permissão para resolver issue" }, { status: 403 });
    }

    const body = await request.json();
    const { resolution } = body;

    const issue = await labOperationsModule.resolveIssue(issueId, resolution);
    return NextResponse.json({ issue });
  } catch (error: any) {
    console.error("Erro ao resolver issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao resolver issue" }, { status: 500 });
  }
}
