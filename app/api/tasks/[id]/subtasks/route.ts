import { NextResponse } from "next/server"
import { routeErrorResponse } from "@/lib/api/route-error-response"
import { getBackendComposition } from "@/backend/composition/root"
import { serializeSubtask } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"

const { taskManagement: taskManagementModule } = getBackendComposition()

/**
 * POST /api/tasks/[id]/subtasks — plano-v4 · V4-4.
 *
 * Formato novo de rota (o padrão que as 20 rotas já migradas seguem, ver AGENTS.md "D4"): a rota
 * autentica e mapeia erro; quem decide quem pode é o caso de uso (`assertCanOperateSubtasks`).
 * Não há `ensurePermission` aqui de propósito: a autoridade da subtask é a da tarefa mãe, e ela
 * depende da tarefa (responsável / membro do projeto / gestor), não só do papel da pessoa.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseInt(params.id)
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 })
    }

    const body = await request.json()
    const { subtask, task } = await taskManagementModule.createTaskSubtask({
      taskId: id,
      actorId: auth.actor.id,
      title: body?.title,
    })

    return NextResponse.json({ subtask: serializeSubtask(subtask), task: task.toJSON() }, { status: 201 })
  } catch (error) {
    return routeErrorResponse(error, { fallback: "Erro ao criar subtask" })
  }
}
