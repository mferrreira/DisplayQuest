import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { TaskService } from "@/backend/services/TaskService"
import { TaskRepository } from "@/backend/repositories/TaskRepository"
import { UserRepository } from "@/backend/repositories/UserRepository"
import { ProjectRepository } from "@/backend/repositories/ProjectRepository"

const taskService = new TaskService(
  new TaskRepository(),
  new UserRepository(),
  new ProjectRepository(),
);

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const userId = parseInt((session.user as any).id);
    const userRoles = (session.user as any).roles || [];
    const { searchParams } = new URL(request.url)
    const projectIdParam = searchParams.get('projectId')
    let tasks

    if (projectIdParam) {
      const projectId = parseInt(projectIdParam)
      if (isNaN(projectId)) {
        return NextResponse.json({ error: "projectId inválido" }, { status: 400 })
      }

      const canAccessAllProjects = userRoles.includes('COORDENADOR') || userRoles.includes('GERENTE')
      if (!canAccessAllProjects) {
        const projectMemberships = await taskService.getProjectsForUser(userId)
        const allowedProjectIds = new Set(projectMemberships.map(project => project.id))
        if (!allowedProjectIds.has(projectId)) {
          return NextResponse.json({ tasks: [] })
        }
      }
      // o método retorna todas as tasks para admins
      tasks = await taskService.getTasksForUser(userId, userRoles)
    
    } else {
      let userTasks = await taskService.getTasksForUser(userId, userRoles)
      let globalTasks = await taskService.getGlobalTasks()

      tasks = [...userTasks, ...globalTasks]
    }
    
    return NextResponse.json({ tasks: tasks.map(task => task.toJSON()) })
  } catch (error) {
    console.error("Erro ao buscar tarefas:", error)
    return NextResponse.json({ error: "Erro ao buscar tarefas" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

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

    const task = await taskService.create({
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
    }, parseInt((session.user as any).id));

    return NextResponse.json({ task: task.toJSON() }, { status: 201 })
  } catch (error: any) {
    console.error("Erro ao criar tarefa:", error)
    return NextResponse.json({ error: error.message || "Erro ao criar tarefa" }, { status: 500 })
  }
}
