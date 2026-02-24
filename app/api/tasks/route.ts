import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"

const { taskManagement: taskManagementModule } = getBackendComposition()

export async function GET(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const userId = auth.actor.id
    const userRoles = auth.actor.roles
    const { searchParams } = new URL(request.url)
    const projectIdParam = searchParams.get('projectId')
    let tasks

    if (projectIdParam) {
      const projectId = parseInt(projectIdParam)
      if (isNaN(projectId)) {
        return NextResponse.json({ error: "projectId inválido" }, { status: 400 })
      }

      const canAccessAllProjects = hasPermission(userRoles, "MANAGE_USERS")
      if (!canAccessAllProjects) {
        const allowedProjectIds = new Set(await taskManagementModule.listActorProjectIds(userId))
        if (!allowedProjectIds.has(projectId)) {
          return NextResponse.json({ tasks: [] })
        }
      }
      tasks = await taskManagementModule.listTasksForActor({
        actorId: userId,
        actorRoles: userRoles,
        projectId,
      })
    
    } else {
      tasks = await taskManagementModule.listTasksForActor({
        actorId: userId,
        actorRoles: userRoles,
      })
    }
    
    return NextResponse.json({ tasks: tasks.map(task => task.toJSON()) })
  } catch (error) {
    console.error("Erro ao buscar tarefas:", error)
    return NextResponse.json({ error: "Erro ao buscar tarefas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const permissionError = ensurePermission(auth.actor, "MANAGE_TASKS", "Sem permissão para criar tarefa")
    if (permissionError) return permissionError

    const body = await request.json()

    const {
      title,
      description,
      status,
      priority,
      assignedTo,
      projectId,
      dueDate,
      points,
      completed,
      taskVisibility,
      isGlobal
    } = body

    const task = await taskManagementModule.createTask({
      title,
      description,
      status,
      priority,
      assignedTo,
      projectId,
      dueDate,
      points,
      completed,
      taskVisibility,
      isGlobal,
    }, auth.actor.id);

    return NextResponse.json({ task: task.toJSON() }, { status: 201 })
  } catch (error: any) {
    console.error("Erro ao criar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao criar tarefa" }, { status: 500 })
  }
}
