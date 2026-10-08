import { NextResponse } from "next/server";
import { userActor } from "@/backend/domain";
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION: "Usuario nao encontrado" (assignee
// invalido) antes caia no 500 com error.message; agora NotFoundError -> 404.
// B6-6 (D4): o gate (MANAGE_USERS OU reporter — o assignee NAO reatribui, medido) e o 400 de
// assigneeId ausente desceram para o AssignIssueUseCase na ordem medida (lookup 404 -> gate 403
// -> 400 assigneeId -> 404 assignee inexistente). Evolucao medida: o 400/403/404 passaram ao
// corpo mapeado {error, code, details} (superset, DEC-53) mantendo as mensagens.
const { labOperations: labOperationsModule } = getBackendComposition();

// POST: Atribuir issue a um usuário
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const body = await request.json();
    const { assigneeId } = body;

    const issue = await labOperationsModule.assignIssue({
      actor,
      issueId: parseInt(params.id),
      // o valor cru vai ao use case: a checagem `!assigneeId` (falsy -> 400) e a mesma medida
      assigneeId: assigneeId as number | undefined,
    });
    return NextResponse.json({ issue });
  } catch (error: any) {
    const mapped = domainErrorResponse(error);
    if (mapped) return mapped;
    console.error("Erro ao atribuir issue:", error);
    return NextResponse.json({ error: error.message || "Erro ao atribuir issue" }, { status: 500 });
  }
}
