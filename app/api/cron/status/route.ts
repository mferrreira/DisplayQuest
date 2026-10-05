import { NextResponse } from "next/server";
import { cronService } from "@/lib/services/cron-service";
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard";
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// B6-1a (DEC-51, 2026-10-05) — CORRECAO DE AUTORIZACAO (unica mudanca de comportamento do
// B6, lote proprio para poder ser revertida sem desfazer o refactor). O gate era
// ensureAnyRole(actor, ["COORDENADOR"]), mas COORDENADOR e GERENTE tem permissoes IDENTICAS
// em backend/domain/identity/permissions.ts (comparadas linha a linha: nenhuma difere), e as
// rotas irmas que protegem o mesmo tipo de gestao — /api/weekly-hours-history e
// /api/projects/stats — usam MANAGE_USERS. Um papel com autoridade identica era barrado aqui e
// nao la. Passa a ser MANAGE_USERS, com a mensagem das irmas. Contrato pinado em
// tests/unit/api/cron-status-roles.test.ts. O B6-1b move este enforcement para o use case.

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const accessError = ensurePermission(auth.actor, "MANAGE_USERS", "Apenas coordenadores e gerentes podem acessar.")
    if (accessError) return accessError

    const status = cronService.getStatus();
    return NextResponse.json({ status });
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar status do cron:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error
    const accessError = ensurePermission(auth.actor, "MANAGE_USERS", "Apenas coordenadores e gerentes podem acessar.")
    if (accessError) return accessError

    const body = await request.json();
    const { action } = body;

    if (action === "manual-reset") {
      await cronService.executeManualReset();
      return NextResponse.json({ 
        message: "Reset manual executado com sucesso"
      });
    }

    return NextResponse.json({ error: "Ação não reconhecida" }, { status: 400 });
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao executar ação do cron:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
