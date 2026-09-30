import { NextResponse } from "next/server";
import { requireApiActor } from "@/lib/auth/api-guard";
import { hasPermission } from "@/lib/auth/rbac";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. Pre-checks de existencia/acesso da rota preservados
// (404/403 com corpo legado exato). Erros de enum do Prisma (QUIRK-8L4) seguem para o 500
// legado — nao sao DomainError.
const { labOperations: labOperationsModule } = getBackendComposition();

function canManageIssue(actor: { id: number; roles: unknown }, issue: { reporterId: number; assigneeId?: number | null }) {
  if (hasPermission(actor.roles, "MANAGE_USERS")) return true;
  return issue.reporterId === actor.id || issue.assigneeId === actor.id;
}

// GET: Obter um issue específico
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const id = parseInt(params.id);

    const issue = await labOperationsModule.getIssue(id);
    if (!issue) {
      return NextResponse.json({ error: "Issue não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ issue });
  } catch (error) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao buscar issue:", error);
    return NextResponse.json({ error: "Erro ao buscar issue" }, { status: 500 });
  }
}

// PUT: Atualizar um issue
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const id = parseInt(params.id);
    const currentIssue = await labOperationsModule.getIssue(id);
    if (!currentIssue) {
      return NextResponse.json({ error: "Issue não encontrado" }, { status: 404 });
    }
    if (!canManageIssue(auth.actor, currentIssue)) {
      return NextResponse.json({ error: "Sem permissão para atualizar issue" }, { status: 403 });
    }
    const body = await request.json();

    const issue = await labOperationsModule.updateIssue(id, body);
    return NextResponse.json({ issue });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao atualizar issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao atualizar issue" }, { status: 500 });
  }
}

// DELETE: Excluir um issue
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const params = await context.params;
    const id = parseInt(params.id);
    const currentIssue = await labOperationsModule.getIssue(id);
    if (!currentIssue) {
      return NextResponse.json({ error: "Issue não encontrado" }, { status: 404 });
    }
    if (!canManageIssue(auth.actor, currentIssue)) {
      return NextResponse.json({ error: "Sem permissão para excluir issue" }, { status: 403 });
    }

    await labOperationsModule.deleteIssue(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao excluir issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao excluir issue" }, { status: 500 });
  }
}
