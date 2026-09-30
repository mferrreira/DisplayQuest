import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): conflitos de estado
// ("Apenas issues abertos podem ser iniciados" / "Issue ja esta fechado" / "Apenas issues
// fechados podem ser reabertos") antes caíam no 500 com error.message; agora ConflictError
// -> 409 (mensagens pinadas no contract 8.3).
const { labOperations: labOperationsModule } = getBackendComposition();

// PATCH: Atualizar status do issue
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const issueId = parseInt(params.id);
    const currentIssue = await labOperationsModule.getIssue(issueId);
    if (!currentIssue) {
      return NextResponse.json({ error: "Issue não encontrado" }, { status: 404 });
    }
    const canManage =
      hasPermission(auth.actor.roles, "MANAGE_USERS") ||
      currentIssue.reporterId === auth.actor.id ||
      currentIssue.assigneeId === auth.actor.id;
    if (!canManage) {
      return NextResponse.json({ error: "Sem permissão para atualizar status do issue" }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    let issue;
    switch (action) {
      case "start":
        issue = await labOperationsModule.startIssueProgress(issueId);
        break;
      case "resolve":
        issue = await labOperationsModule.resolveIssue(issueId);
        break;
      case "closed":
        issue = await labOperationsModule.closeIssue(issueId);
        break;
      case "reopen":
        issue = await labOperationsModule.reopenIssue(issueId);
        break;
      case "unassign":
        issue = await labOperationsModule.unassignIssue(issueId);
        break;
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }

    return NextResponse.json({ issue });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao atualizar status do issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao atualizar status do issue" }, { status: 500 });
  }
}
