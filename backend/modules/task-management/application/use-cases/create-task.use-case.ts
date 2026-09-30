import {
  canCreateGlobalQuest,
  createTaskRecord,
  ForbiddenError,
  normalizeAssigneeIds,
  NotFoundError,
  toTaskView,
  type Task,
} from "@/backend/domain";
import type { CreateTaskCommand } from "@/backend/modules/task-management/application/contracts";
import type { TaskAssigneesPort } from "@/backend/modules/task-management/application/ports/task-assignees.repository";
import type { TaskActorsPort } from "@/backend/modules/task-management/application/ports/task-actors.port";
import type { TaskProjectsPort } from "@/backend/modules/task-management/application/ports/task-projects.port";
import type { TaskRepositoryPort } from "@/backend/modules/task-management/application/ports/task.repository";
import { syncAssignees } from "@/backend/modules/task-management/application/use-cases/internal/task-view";

/**
 * CreateTaskUseCase — OND4-B3 (R2): rules moved from TaskServiceGateway.createTask.
 * Frozen (OND4-B1): createdBy is FORCED to the actor; individual mode (default) fans out
 * one task per assignee sharing groupTaskId = first created id (with best-effort cleanup
 * on mid-loop failure); shared mode creates one task with all assignees; global quests
 * need MANAGE_USERS on the creator and force assignedTo/projectId null + public + no
 * assignees; assignees are validated to exist; task_assignees are synced after creation.
 */
export interface CreateTaskDependencies {
  tasks: TaskRepositoryPort
  assignees: TaskAssigneesPort
  actors: TaskActorsPort
  projects: TaskProjectsPort
}

export class CreateTaskUseCase {
  constructor(private readonly dependencies: CreateTaskDependencies) {}

  async execute(command: CreateTaskCommand, actorId: number): Promise<Task> {
    const creator = await this.dependencies.actors.findById(actorId)
    if (!creator) {
      throw new NotFoundError("Criador não encontrado")
    }

    const data: CreateTaskCommand = { ...command, createdBy: actorId }
    const normalizedAssigneeIds = normalizeAssigneeIds(data as Record<string, unknown>)

    const creationMode = data.creationMode ?? "individual"
    if (creationMode === "individual" && !data.isGlobal && normalizedAssigneeIds.length > 1) {
      return await this.createIndividualTasks(data, normalizedAssigneeIds, actorId)
    }

    if (data.isGlobal) {
      if (!canCreateGlobalQuest(creator.roles)) {
        throw new ForbiddenError("Usuário não tem permissão para criar quests globais")
      }
      data.assignedTo = null
      data.projectId = null
      data.taskVisibility = "public"
      data.assigneeIds = []
    } else {
      if (data.projectId) {
        const project = await this.dependencies.projects.findById(data.projectId)
        if (!project) {
          throw new NotFoundError("Projeto não encontrado")
        }
      }

      await this.ensureAssigneesExist(
        normalizedAssigneeIds.length > 0
          ? normalizedAssigneeIds
          : data.assignedTo
            ? [data.assignedTo]
            : [],
      )
      if (normalizedAssigneeIds.length > 0) {
        data.assignedTo = normalizedAssigneeIds[0]
        data.assigneeIds = normalizedAssigneeIds
      }
    }

    const createdTask = await this.dependencies.tasks.create(
      createTaskRecord({ ...data, status: data.status, priority: data.priority }, new Date()),
    )

    if (!data.isGlobal) {
      const assigneeIdsToPersist = normalizedAssigneeIds.length > 0
        ? normalizedAssigneeIds
        : createdTask.assignedTo
          ? [createdTask.assignedTo]
          : []
      await syncAssignees(createdTask.id!, assigneeIdsToPersist, actorId, this.dependencies.assignees)
      return toTaskView({
        ...createdTask,
        assigneeIds: assigneeIdsToPersist,
        assignedTo: assigneeIdsToPersist[0] ?? null,
      })
    }

    return toTaskView({ ...createdTask, assigneeIds: [], assignedTo: null })
  }

  private async createIndividualTasks(
    data: CreateTaskCommand,
    assigneeIds: number[],
    actorId: number,
  ): Promise<Task> {
    const createdTasks: Task[] = []
    let groupTaskId: number | null = data.groupTaskId ?? null

    // No transaction on the port, so on a mid-loop failure we delete what was already
    // created to avoid leaving an orphaned/incomplete group (frozen legacy behavior).
    try {
      for (const assigneeId of assigneeIds) {
        const record = createTaskRecord(
          { ...data, assigneeIds: [assigneeId], assignedTo: assigneeId },
          new Date(),
        )
        const created = await this.dependencies.tasks.create(record)

        if (!groupTaskId) groupTaskId = created.id!
        const withGroup = { ...created, groupTaskId }
        await this.dependencies.tasks.update(created.id!, withGroup)

        await syncAssignees(created.id!, [assigneeId], actorId, this.dependencies.assignees)
        createdTasks.push(toTaskView({ ...withGroup, assigneeIds: [assigneeId], assignedTo: assigneeId }))
      }

      return createdTasks[0]
    } catch (error) {
      for (const created of createdTasks) {
        try {
          await this.dependencies.tasks.delete(created.id!)
        } catch {
          // Best-effort cleanup; the original error is what surfaces.
        }
      }
      throw error
    }
  }

  private async ensureAssigneesExist(userIds: number[]) {
    for (const userId of userIds) {
      const assignee = await this.dependencies.actors.findById(userId)
      if (!assignee) {
        throw new NotFoundError("Usuário não encontrado")
      }
    }
  }
}
