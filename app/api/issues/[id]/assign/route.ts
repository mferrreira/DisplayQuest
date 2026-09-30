import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION: "Usuario nao encontrado" (assignee
// invalido) antes caia no 500 com error.message; agora NotFoundError -> 404.
const { labOperations: labOperationsModule } = getBackendComposition();

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
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao atribuir issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao atribuir issue" }, { status: 500 });
  }
}
