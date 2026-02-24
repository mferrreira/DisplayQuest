import { NextResponse } from "next/server"
import { prisma } from "@/lib/database/prisma"
import { ensurePermission, requireApiActor } from "@/lib/auth/api-guard"

const STUDENT_ROLES = ["VOLUNTARIO", "COLABORADOR", "PESQUISADOR", "GERENTE_PROJETO"] as const

export async function GET() {
  try {
    const auth = await requireApiActor()
    if (auth.error) return auth.error

    const deny = ensurePermission(auth.actor, "MANAGE_USERS", "Acesso negado")
    if (deny) return deny

    const globalTasks = await prisma.tasks.findMany({
      where: {
        isGlobal: true,
      },
      orderBy: { id: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        points: true,
      },
    })

    const users = await prisma.users.findMany({
      where: {
        status: "active",
      },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
      },
      orderBy: { name: "asc" },
    })

    const targetUsers = users.filter((user) =>
      user.roles.some((role) => STUDENT_ROLES.includes(role as any)),
    )

    const taskIds = globalTasks.map((task) => task.id)
    const taskUserProgressTable = (prisma as any).task_user_progress
    const progressCompletionRows =
      taskIds.length === 0 || !taskUserProgressTable
        ? []
        : await taskUserProgressTable.findMany({
            where: {
              taskId: { in: taskIds },
              completedAt: { not: null },
            },
            select: {
              taskId: true,
              userId: true,
            },
          })

    const legacyCompletionRows =
      taskIds.length === 0
        ? []
        : await prisma.work_session_tasks.findMany({
            where: {
              taskId: { in: taskIds },
              workSession: {
                status: "completed",
              },
            },
            select: {
              taskId: true,
              workSession: {
                select: {
                  userId: true,
                },
              },
            },
          })

    const completedByTask = new Map<number, Set<number>>()
    for (const row of progressCompletionRows) {
      const set = completedByTask.get(row.taskId) ?? new Set<number>()
      if (row.userId) {
        set.add(row.userId)
      }
      completedByTask.set(row.taskId, set)
    }

    for (const row of legacyCompletionRows) {
      const set = completedByTask.get(row.taskId) ?? new Set<number>()
      if (row.workSession?.userId) {
        set.add(row.workSession.userId)
      }
      completedByTask.set(row.taskId, set)
    }

    const data = globalTasks.map((task) => {
      const completedSet = completedByTask.get(task.id) ?? new Set<number>()
      const completedUsers = targetUsers.filter((user) => completedSet.has(user.id))
      const pendingUsers = targetUsers.filter((user) => !completedSet.has(user.id))

      return {
        ...task,
        audienceSize: targetUsers.length,
        completedCount: completedUsers.length,
        pendingCount: pendingUsers.length,
        completionRate: targetUsers.length > 0 ? (completedUsers.length / targetUsers.length) * 100 : 0,
        completedUsers: completedUsers.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles,
        })),
        pendingUsers: pendingUsers.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          roles: user.roles,
        })),
      }
    })

    return NextResponse.json({ globalTasks: data }, { status: 200 })
  } catch (error: any) {
    console.error("Erro ao buscar progresso de tarefas globais:", error)
    return NextResponse.json({ error: error?.message || "Erro interno do servidor" }, { status: 500 })
  }
}
