import { NextResponse } from "next/server"
import { createTaskManagementModule } from "@/backend/modules/task-management"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"

const taskManagementModule = createTaskManagementModule()

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const id = parseInt(params.id)
    const task = await taskManagementModule.getTaskById(id)
    if (!task) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }

    const actor = auth.actor
    if (!hasPermission(actor.roles, "MANAGE_USERS")) {
      const isOwner = task.assignedTo === actor.id
      if (!isOwner) {
        const allowedProjectIds = new Set(await taskManagementModule.listActorProjectIds(actor.id))
        if (task.projectId && !allowedProjectIds.has(task.projectId)) {
          return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        }
      }
    }

    return NextResponse.json({ task: task.toJSON() })
  } catch (error) {
    console.error("Erro ao buscar tarefa:", error)
    return NextResponse.json({ error: "Erro ao buscar tarefa" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_TASKS", "Sem permissão para editar tarefa")
    if (permissionError) return permissionError

    const params = await context.params
    const id = parseInt(params.id)
    const body = await request.json()

    const allowedFields = [
      "title", 
      "description", 
      "status", 
      "priority", 
      "assignedTo", 
      "projectId", 
      "dueDate", 
      "points", 
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
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }
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
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }
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
    
    const task = await taskManagementModule.completeTask({
      taskId: id,
      userId: userToAward,
    })
    
    console.log(`✅ Task ${id} completed by user ${userToAward}. Awarded ${task.points} points.`)
    
    return NextResponse.json({ task: task.toJSON() })
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 })
    }
    console.error("Erro ao completar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao completar tarefa" }, { status: 500 })
  }
}
