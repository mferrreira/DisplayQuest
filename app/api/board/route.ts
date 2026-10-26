import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"

const { gamification } = getBackendComposition()

/**
 * GET /api/board — plan-v9 S01 (MODELO R4, §7).
 *
 * Diz qual mes o Quadro de Liderança esta usando, com que trilha, e se ele ja fechou. Leitura do
 * autenticado, como o quadro de hoje: nenhum gate novo de leitura (DEC-136).
 *
 * S01 entrega o mes corrente. `?month=AAAA-MM` (mes fechado) entra na S03, no mesmo contrato.
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    return NextResponse.json(gamification.readBoardMonth(new Date()))
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao ler o mês do quadro" })
  }
}
