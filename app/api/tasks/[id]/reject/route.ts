import { NextRequest, NextResponse } from "next/server"
import { requireApiActor } from "@/lib/auth/api-guard"
import { getBackendComposition } from "@/backend/composition/root"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { taskManagement: taskManagementModule } = getBackendComposition()

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const taskId = parseInt(params.id)
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "ID de tarefa inválido" }, { status: 400 })
    }

    const body = await request.json()
    const { reason } = body

    const task = await taskManagementModule.rejectTask({
      taskId,
      approverId: auth.actor.id,
      reason,
    })
    
    return NextResponse.json({ 
      success: true, 
      message: "Tarefa rejeitada com sucesso",
      task: task.toJSON()
    }, { status: 200 })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao rejeitar tarefa:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Erro ao rejeitar tarefa" 
    }, { status: 500 })
  }
}
