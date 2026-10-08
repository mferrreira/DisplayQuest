import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"
// OND8-B4 (R4): DomainErrors mapeados por domainErrorResponse (leitura — sem erros de
// regra esperados; fallback legado preservado).
const { labOperations: labOperationsModule } = getBackendComposition()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const { searchParams } = new URL(request.url)
    const rawDays = Number(searchParams.get("days"))
    const days = Number.isInteger(rawDays) && rawDays > 0 ? rawDays : 14

    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)

    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + Math.min(days, 31) - 1)
    endDate.setHours(23, 59, 59, 999)

    const events = await labOperationsModule.listLabEventsByRange({ startDate, endDate })

    return NextResponse.json({ events: events.map((event) => event.toJSON()) })
  } catch (error: any) {
    return routeErrorResponse(error, { fallback: "Erro ao buscar próximos eventos", exposeMessage: true })
  }
}