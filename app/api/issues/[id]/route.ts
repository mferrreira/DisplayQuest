import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { userActor } from "@/backend/domain";
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
// OND8-B4 (R4): DomainErrors mapeados. Erros de enum do Prisma (QUIRK-8L4) seguem para o 500
// legado — nao sao DomainError.
// B6-6 (D4): o pre-check `getIssue` + `canManageIssue` da rota SAIU — os use cases update/delete
// ja decidem a MESMA regra (lookup 404 -> gate 403: MANAGE_USERS OU reporter OU assignee) com as
// mensagens congeladas ("Sem permissão para atualizar/excluir issue"). Evolucoes medidas: o 404
// de issue ausente passou de corpo manual para NotFoundError mapeado {error, code, details}
// (superset, DEC-53); o 403 ganhou code/details mantendo a mensagem. GET segue leitura aberta
// (QUIRK medido: qualquer autenticado le) e o 404 do GET continua legado verbatim.
const { labOperations: labOperationsModule } = getBackendComposition();

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
    return routeErrorResponse(error, { fallback: "Erro ao buscar issue" })
  }
}

// PUT: Atualizar um issue
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const body = await request.json();

    const issue = await labOperationsModule.updateIssue({
      actor,
      issueId: parseInt(params.id),
      data: body,
    });
    return NextResponse.json({ issue });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao atualizar issue", exposeMessage: true })
  }
}

// DELETE: Excluir um issue
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;

    await labOperationsModule.deleteIssue({
      actor,
      issueId: parseInt(params.id),
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao excluir issue", exposeMessage: true })
  }
}
