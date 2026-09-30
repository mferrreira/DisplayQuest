import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port"
import type { TaskProgressPort } from "@/backend/modules/task-management/application/ports/task-progress.repository"
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository"

/**
 * ListGlobalProgressUseCase — OND4-B4 (R2): the global-progress aggregation that used to
 * live inline in `app/api/tasks/global-progress/route.ts` (a route reading Prisma directly,
 * rg06 debt). Behavior frozen from the route:
 *   - rows: tasks with isGlobal=true, id DESC;
 *   - roster: ACTIVE users whose roles include a student role, name ASC;
 *   - completion signals: task_user_progress rows with completedAt set (when the table
 *     exists) UNION work_session_tasks links of COMPLETED work sessions (legacy signal);
 *   - counts/rates are computed over the roster only.
 */

/** Roster filter (frozen from the route's STUDENT_ROLES). */
const STUDENT_ROLES: string[] = ["VOLUNTARIO", "COLABORADOR", "PESQUISADOR", "GERENTE_PROJETO"]

export interface GlobalProgressEntry {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  points: number
  audienceSize: number
  completedCount: number
  pendingCount: number
  completionRate: number
  completedUsers: Array<{ id: number; name: string; email: string; roles: string[] }>
  pendingUsers: Array<{ id: number; name: string; email: string; roles: string[] }>
}

export interface ListGlobalProgressDependencies {
  tasks: TaskRepositoryPort
  actors: TaskActorsPort
  progress: TaskProgressPort
}

export class ListGlobalProgressUseCase {
  constructor(private readonly dependencies: ListGlobalProgressDependencies) {}

  async execute(): Promise<GlobalProgressEntry[]> {
    const globalTasks = (await this.dependencies.tasks.findAll()).filter((task) => task.isGlobal)

    const targetUsers = (await this.dependencies.actors.listActiveUsers()).filter((user) =>
      user.roles.some((role) => STUDENT_ROLES.includes(role)),
    )

    const taskIds = globalTasks.map((task) => task.id!).filter((id) => id != null)

    const progressRows =
      taskIds.length === 0 || !this.dependencies.progress.isAvailable()
        ? []
        : await this.dependencies.progress.listCompletedByTaskIds(taskIds)

    const legacyCompletionRows =
      taskIds.length === 0
        ? []
        : await this.dependencies.progress.listSessionCompletionsByTaskIds(taskIds)

    const completedByTask = new Map<number, Set<number>>()
    for (const row of progressRows) {
      const set = completedByTask.get(row.taskId) ?? new Set<number>()
      if (row.userId) {
        set.add(row.userId)
      }
      completedByTask.set(row.taskId, set)
    }
    for (const row of legacyCompletionRows) {
      const set = completedByTask.get(row.taskId) ?? new Set<number>()
      if (row.userId) {
        set.add(row.userId)
      }
      completedByTask.set(row.taskId, set)
    }

    return globalTasks.map((task) => {
      const completedSet = completedByTask.get(task.id!) ?? new Set<number>()
      const completedUsers = targetUsers.filter((user) => completedSet.has(user.id))
      const pendingUsers = targetUsers.filter((user) => !completedSet.has(user.id))

      return {
        id: task.id!,
        title: task.title,
        description: task.description ?? null,
        status: task.status as string,
        priority: task.priority as string,
        points: task.points,
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
  }
}
