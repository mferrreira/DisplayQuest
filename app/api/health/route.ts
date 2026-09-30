import { NextResponse } from "next/server"
import { checkDatabaseHealth } from "@/backend/composition/root"
// OND9-B1 (RG-06): a rota passou a ler a saude pela composition root — nao instancia mais
// um PrismaClient proprio (compartilha o client do app). Body/status IDENTICOS ao legado.
export async function GET() {
  const healthy = await checkDatabaseHealth()

  if (healthy) {
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected"
    })
  }

  return NextResponse.json(
    {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: "Database connection failed"
    },
    { status: 503 }
  )
}
