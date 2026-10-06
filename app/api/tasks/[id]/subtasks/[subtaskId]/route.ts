import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { serializeSubtask } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { taskManagement: taskManagementModule } = getBackendComposition()

/**
 * /api/tasks/[id]/subtasks/[subtaskId] — plano-v4 · V4-4.
 *
 * PATCH aceita `title` e/ou `completed`. Concluir é o que destrava a mãe, e é também o caminho
 * do auto-move: a resposta devolve a mãe já em `in-review` quando a última subtask foi concluída,
 * para o cliente não ter que recarregar o quadro para ver o que acabou de acontecer.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; subtaskId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseInt(params.id)
    const subtaskId = parseInt(params.subtaskId)
    if (Number.isNaN(id) || Number.isNaN(subtaskId)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const body = await request.json()
    const { subtask, task } = await taskManagementModule.updateTaskSubtask({
      taskId: id,
      subtaskId,
      actorId: auth.actor.id,
      ...(body?.title !== undefined ? { title: body.title } : {}),
      ...(body?.completed !== undefined ? { completed: Boolean(body.completed) } : {}),
    })

    return NextResponse.json({ subtask: serializeSubtask(subtask), task: task.toJSON() })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar subtask:", error)
    return NextResponse.json({ error: "Erro ao atualizar subtask" }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; subtaskId: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseInt(params.id)
    const subtaskId = parseInt(params.subtaskId)
    if (Number.isNaN(id) || Number.isNaN(subtaskId)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const { subtask, task } = await taskManagementModule.deleteTaskSubtask({
      taskId: id,
      subtaskId,
      actorId: auth.actor.id,
    })

    return NextResponse.json({ subtask: serializeSubtask(subtask), task: task.toJSON() })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao excluir subtask:", error)
    return NextResponse.json({ error: "Erro ao excluir subtask" }, { status: 500 })
  }
}
