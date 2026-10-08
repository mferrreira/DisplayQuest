import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { serializeSubtask } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"

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
    return routeErrorResponse(error, { fallback: "Erro ao atualizar subtask" })
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
    return routeErrorResponse(error, { fallback: "Erro ao excluir subtask" })
  }
}
