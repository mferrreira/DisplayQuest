import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { requireApiActor } from "@/lib/auth/api-guard"

const { gamification: gamificationModule } = getBackendComposition()

/**
 * GET /api/gamification/ranking — plan-v8 V8-7 (DEC-220). O quadro do MÊS em curso (MODELO §3).
 *
 * Rota fina (D4): autentica e devolve o que o use case produziu. Não há gate de permissão porque não
 * há decisão de direito aqui — o quadro de liderança é leitura do autenticado hoje (a tela monta o
 * quadro a partir da lista de usuários, que é aberta), e a sessão continua exigida por `requireApiActor`.
 *
 * O `now` é o instante da chamada e entra no use case como parâmetro: quem decide o mês é o domínio
 * (`currentMonthOfInstant` + `monthWindow`, DEC-212), e nenhuma rota conta mês por conta própria
 * (DEC-132).
 */
export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const ranking = await gamificationModule.listMonthlyRanking({ now: new Date() })
    return NextResponse.json({ ranking })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar o ranking do mês" })
  }
}
