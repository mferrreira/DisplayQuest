import { NextResponse } from "next/server"
import { getBackendComposition } from "@/backend/composition/root"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"
import { hasPermission } from "@/lib/auth/rbac"
import { domainErrorResponse } from "@/lib/api/domain-error-response"

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
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
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

    if (Array.isArray(body?.tasks)) {
      if (body.tasks.length === 0) {
        return NextResponse.json({ error: "Nenhuma task informada para backlog" }, { status: 400 })
      }

      const createdTasks = await taskManagementModule.createTaskBacklog(
        body.tasks.map((task: any) => ({
          title: task.title,
          description: task.description ?? "",
          status: task.status ?? "to-do",
          priority: task.priority ?? "medium",
          assignedTo: task.assignedTo ?? null,
          assigneeIds: Array.isArray(task.assigneeIds) ? task.assigneeIds : undefined,
          projectId: task.projectId ?? null,
          dueDate: task.dueDate ?? null,
          // plan-v3 OND1-D (DEC-30): o importador de backlog não define pontuação. A coluna
          // `points` continua existindo no schema como histórico e recebe POINTS_PER_TASK.
          completed: task.completed ?? false,
          taskVisibility: task.taskVisibility ?? "delegated",
          isGlobal: task.isGlobal ?? false,
          creationMode: task.creationMode ?? "individual",
        })),
        auth.actor.id,
      )

      return NextResponse.json({
        tasks: createdTasks.map((task) => task.toJSON()),
        createdCount: createdTasks.length,
      }, { status: 201 })
    }

    const {
      title,
      description,
      status,
      priority,
      assignedTo,
      assigneeIds,
      projectId,
      dueDate,
      completed,
      taskVisibility,
      isGlobal,
      creationMode,
      subtasks
    } = body

    // plan-v3 OND1-D (AC-P3-03): `points` não é lido do corpo. createTaskRecord aplica
    // POINTS_PER_TASK quando o caller não informa — a superfície deixou de definir valor.
    // plan-v4 · V4-4 (D-D): `subtasks` é lido do corpo — a mãe nasce com a lista, no mesmo
    // formulário. O backlog (branch acima) não aceita subtask de propósito.
    const task = await taskManagementModule.createTask({
      title,
      description,
      status,
      priority,
      assignedTo,
      assigneeIds,
      projectId,
      dueDate,
      completed,
      taskVisibility,
      isGlobal,
      creationMode,
      subtasks,
    }, auth.actor.id);

    return NextResponse.json({ task: task.toJSON() }, { status: 201 })
  } catch (error: any) {
    const mapped = domainErrorResponse(error)
    if (mapped) return mapped
    console.error("Erro ao criar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao criar tarefa" }, { status: 500 })
  }
}
