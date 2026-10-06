import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { serializeSubtask } from "@/backend/domain"
import { requireApiActor } from "@/lib/auth/api-guard"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar subtask:", error)
    return NextResponse.json({ error: "Erro ao criar subtask" }, { status: 500 })
  }
}
