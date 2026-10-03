import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

const { taskManagement: taskManagementModule } = getBackendComposition()

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseInt(params.id)
    const task = await taskManagementModule.getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }

    const actor = auth.actor
    if (!hasPermission(actor.roles, "MANAGE_USERS")) {
      const isOwner = task.assignedTo === actor.id || task.assigneeIds?.includes(actor.id)
      if (!isOwner) {
        const allowedProjectIds = new Set(await taskManagementModule.listActorProjectIds(actor.id))
        if (task.projectId && !allowedProjectIds.has(task.projectId)) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        }
      }
    }

    return NextResponse.json({ task: task.toJSON() })
  } catch (error) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao buscar tarefa:", error)
    return NextResponse.json({ error: "Erro ao buscar tarefa" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params
    const id = parseInt(params.id)
    const body = await request.json()
    const canManageTasks = hasPermission(auth.actor.roles, "MANAGE_TASKS")

    if (!canManageTasks) {
      const nonEmptyKeys = Object.keys(body ?? {})
      const onlyPublicProgressFields =
        nonEmptyKeys.length > 0 &&
        nonEmptyKeys.every((key) => key === "status" || key === "assignedTo")

      if (!onlyPublicProgressFields) {
        const permissionError = ensurePermission(auth.actor, "MANAGE_TASKS", "Sem permissão para editar tarefa")
        if (permissionError) return permissionError
      }
    }

    const allowedFields = [
      "title", 
      "description", 
      "status", 
      "priority", 
      "assignedTo", 
      "assigneeIds",
      "projectId", 
      "dueDate", 
      // plan-v3 OND1-D (AC-P3-03): "points" saiu da lista — editar tarefa não redefine valor.
      "completed", 
      "taskVisibility", 
      "isGlobal"
    ];
    const data: any = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key]
    }

    const task = await taskManagementModule.updateTask({
      taskId: id,
      actorId: auth.actor.id,
      data,
    })
    return NextResponse.json({ task: task.toJSON() })
  } catch (error: any) {
    // OND4-B4 (R4): typed DomainErrors carry their own status (404/403/400/409); the old
    // string heuristics ('not found' never matched the Portuguese messages) are gone.
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao atualizar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao atualizar tarefa" }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_TASKS", "Sem permissão para excluir tarefa")
    if (permissionError) return permissionError

    const params = await context.params
    const id = parseInt(params.id)
    await taskManagementModule.deleteTask({
      taskId: id,
      actorId: auth.actor.id,
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao excluir tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao excluir tarefa" }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const params = await context.params;
    const id = parseInt(params.id)
    const body = await request.json()
    const { action, userId } = body

    if (action !== "complete") {
      return NextResponse.json({ error: "Ação inválida. Use 'complete' para marcar tarefa como concluída." }, { status: 400 })
    }

    const actorId = auth.actor.id
    const userToAward = userId ? parseInt(userId) : actorId;
    if (Number.isNaN(userToAward) || userToAward <= 0) {
      return NextResponse.json({ error: "userId inválido" }, { status: 400 })
    }
    if (userToAward !== actorId && !hasPermission(auth.actor.roles, "MANAGE_TASKS")) {
      return NextResponse.json({ error: "Sem permissão para concluir tarefa para outro usuário" }, { status: 403 })
    }
    
    const { task, awardedTo, awardedPoints } = await taskManagementModule.completeTask({
      taskId: id,
      userId: userToAward,
    })

    // O valor creditado é decidido pelo domínio (points-rules) e confirmado pelo publisher de
    // gamificação, que devolve o **efetivo** (OND4-A) — inclusive 0 quando o award já existia.
    // Antes desta Onda a rota não sabia o número, e o próprio código registrava isso como
    // limitação aceita; logar `task.points` mentia e continua mentindo (plan-v3 OND1-D).
    console.log(`✅ Task ${id} completed by user ${userToAward}.`)

    return NextResponse.json({ task: task.toJSON(), awardedTo, awardedPoints })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao completar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao completar tarefa" }, { status: 500 })
  }
}
