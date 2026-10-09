import { NextResponse } from "next/server";
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard";
import { getBackendComposition } from "@/backend/composition/root";
// B6-1a (DEC-51, 2026-10-05) — CORRECAO DE AUTORIZACAO (unica mudanca de comportamento do
// B6, lote proprio para poder ser revertido sem desfazer o refactor). O gate era
// ensureAnyRole(actor, ["COORDENADOR"]), mas COORDENADOR e GERENTE tem permissoes IDENTICAS
// em backend/domain/identity/permissions.ts (comparadas linha a linha: nenhuma difere), e as
// rotas irmas que protegem o mesmo tipo de gestao — /api/weekly-hours-history e
// /api/projects/stats — usam MANAGE_USERS. Um papel com autoridade identica era barrado aqui e
// nao la. Passa a ser MANAGE_USERS, com a mensagem das irmas.
//
// B6-1b (D4) — o enforcement desceu para o modulo: a rota nao decide mais, ela so mapeia.
//   - GET  -> workExecution.getCronStatusForActor
//   - POST -> workExecution.executeManualCronActionForActor
// O gate (MANAGE_USERS + a mensagem congelada) e o despacho da acao estao em
// application/use-cases/{get-cron-status,execute-manual-cron-reset}.use-case.ts. O `action`
// viaja no comando DEPOIS do gate de proposito: a rota checava o papel antes de ler o corpo,
// entao um POST nao autorizado com acao desconhecida respondia 403 e nao 400 — inverter essa
// ordem mudaria o contrato.
//
// EVOLUTION documentada (padrao OND8-B4): POST com acao desconhecida era
// NextResponse.json({error}, 400); agora e ValidationError, entao o corpo ganha
// `code`/`details` ao lado do mesmo `error`. Status e mensagem intactos.
//
// Contrato pinado em tests/unit/api/cron-status-roles.test.ts e no teste do use case.

const { workExecution } = getBackendComposition()

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const status = await workExecution.getCronStatusForActor({ actorRoles: auth.actor.roles });
    return NextResponse.json({ status });
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const body = await request.json();
    const { action } = body;

    const result = await workExecution.executeManualCronActionForActor({
      actorRoles: auth.actor.roles,
      action,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro interno do servidor" })
  }
}