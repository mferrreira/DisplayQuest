import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { requireApiActor } from "@/lib/auth/api-guard"

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
    console.error("Erro ao buscar próximos eventos:", error)
    return NextResponse.json({ error: error.message || "Erro ao buscar próximos eventos" }, { status: 500 })
  }
}