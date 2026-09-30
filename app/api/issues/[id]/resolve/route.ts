import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION: "Descricao da resolucao e obrigatoria"
// (ValidationError) e conflitos de estado antes caíam no 500 com error.message; agora
// 400/409 {error,code,details}.
const { labOperations: labOperationsModule } = getBackendComposition();

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
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao resolver issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao resolver issue" }, { status: 500 });
  }
}
