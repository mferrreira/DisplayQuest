import { NextRequest, NextResponse } from "next/server"
import { createTaskManagementModule } from "@/backend/modules/task-management"
import { requireApiActor } from "@/lib/auth/api-guard"

const taskManagementModule = createTaskManagementModule()

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const taskId = parseInt(params.id)
    if (isNaN(taskId)) {
      return NextResponse.json({ error: "ID de tarefa inválido" }, { status: 400 })
    }

    const task = await taskManagementModule.approveTask({
      taskId,
      approverId: auth.actor.id,
    })
    
    return NextResponse.json({ 
      success: true, 
      message: "Tarefa aprovada com sucesso",
      task: task.toJSON()
    }, { status: 200 })
  } catch (error) {
    console.error("Erro ao aprovar tarefa:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Erro ao aprovar tarefa" 
    }, { status: 500 })
  }
}
