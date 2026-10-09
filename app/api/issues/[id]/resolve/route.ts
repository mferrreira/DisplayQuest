import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { userActor } from "@/backend/domain";
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root"
// OND8-B4 (R4): DomainErrors mapeados. EVOLUTION: "Descricao da resolucao e obrigatoria"
// (ValidationError) e conflitos de estado antes caíam no 500 com error.message; agora
// 400/409 {error,code,details}.
// B6-6 (D4): o gate (MANAGE_USERS OU reporter OU assignee) desceu para o ResolveIssueUseCase com
// a mensagem congelada desta rota — "Sem permissão para resolver issue" — que e DIFERENTE da do
// PATCH status para a MESMA acao (medido; a mensagem chega por parametro deniedMessage).
const { labOperations: labOperationsModule } = getBackendComposition();

// POST: Resolver um issue
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor();
    if (auth.error) return auth.error;

    const actor = userActor(auth.actor.id, auth.actor.roles);
    const params = await context.params;
    const body = await request.json();
    const { resolution } = body;

    const issue = await labOperationsModule.resolveIssue({
      actor,
      issueId: parseInt(params.id),
      resolution,
      deniedMessage: "Sem permissão para resolver issue",
    });
    return NextResponse.json({ issue });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao resolver issue", exposeMessage: true })
  }
}
