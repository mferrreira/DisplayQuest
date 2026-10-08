import { NextResponse } from "next/server";
import { userActor } from "@/backend/domain";
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION (documentada): conflitos de estado
// ("Apenas issues abertos podem ser iniciados" / "Issue ja esta fechado" / "Apenas issues
// fechados podem ser reabertos") antes caíam no 500 com error.message; agora ConflictError
// -> 409 (mensagens pinadas no contract 8.3).
// B6-6 (D4): o gate (MANAGE_USERS OU reporter OU assignee, mensagem "Sem permissão para atualizar
// status do issue") desceu para cada use case de ação, na ordem medida (lookup 404 -> gate 403 ->
// conflito de estado). O switch de ação fica na rota (despacho, nao autorizacao). Evolucao
// medida: acao DESCONHECIDA agora e 400 antes de qualquer gate — antes, terceiro sem permissao
// com acao invalida recebia 403; o par (gate antes do 400) segue valendo para acoes validas.
const { labOperations: labOperationsModule } = getBackendComposition();

const STATUS_DENIED_MESSAGE = "Sem permissão para atualizar status do issue";

// PATCH: Atualizar status do issue
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const issueId = parseInt(params.id);
    const body = await request.json();
    const { action } = body;

    let issue;
    switch (action) {
      case "start":
        issue = await labOperationsModule.startIssueProgress({ actor, issueId, deniedMessage: STATUS_DENIED_MESSAGE });
        break;
      case "resolve":
        issue = await labOperationsModule.resolveIssue({ actor, issueId, deniedMessage: STATUS_DENIED_MESSAGE });
        break;
      case "closed":
        issue = await labOperationsModule.closeIssue({ actor, issueId, deniedMessage: STATUS_DENIED_MESSAGE });
        break;
      case "reopen":
        issue = await labOperationsModule.reopenIssue({ actor, issueId, deniedMessage: STATUS_DENIED_MESSAGE });
        break;
      case "unassign":
        issue = await labOperationsModule.unassignIssue({ actor, issueId, deniedMessage: STATUS_DENIED_MESSAGE });
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
