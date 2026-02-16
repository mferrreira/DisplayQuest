import { Task, ITask } from '../models/Task';
import { TaskRepository, ITaskRepository } from '../repositories/TaskRepository';
import { UserRepository } from '../repositories/UserRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { createNotificationsModule, NotificationsModule } from '@/backend/modules/notifications';
import { createIdentityAccessModule, IdentityAccessModule } from '@/backend/modules/identity-access';
import { createTaskProgressEvents } from './infrastructure/gamification-task-progress.events';
import type { TaskProgressEvents } from './ports/task-progress.events';

export interface ITaskService {
  findById(id: number): Promise<Task | null>;
  findAll(): Promise<Task[]>;
  create(data: Omit<Task, 'id'>, creatorId: number): Promise<Task>;
  update(id: number, data: Partial<Task>, userId: number): Promise<Task>;
  delete(id: number, userId: number): Promise<void>;
  findByAssigneeId(userId: number): Promise<Task[]>;
  getTasksByUser(userId: number): Promise<Task[]>;
  getTasksForUser(userId: number, userRoles: string[]): Promise<Task[]>;
  getProjectsForUser(userId: number): Promise<{ id: number }[]>;
  getGlobalTasks(): Promise<Task[]>;
  completeTask(taskId: number, userId: number): Promise<Task>;
  approveTask(taskId: number, leaderId: number): Promise<Task>;
  rejectTask(taskId: number, leaderId: number, reason?: string): Promise<Task>;
}

export class TaskService implements ITaskService {
  private notificationsModule: NotificationsModule;
  private taskProgressEvents: TaskProgressEvents;
  private identityAccess: IdentityAccessModule;

  constructor(
    private taskRepository: ITaskRepository,
    private userRepository: UserRepository,
    private projectRepository: ProjectRepository,
    taskProgressEvents?: TaskProgressEvents,
  ) {
    this.notificationsModule = createNotificationsModule();
    this.taskProgressEvents = taskProgressEvents || createTaskProgressEvents();
    this.identityAccess = createIdentityAccessModule();
  }

  async findById(id: number): Promise<Task | null> {
    return await this.taskRepository.findById(id);
  }

  async findAll(): Promise<Task[]> {
    return await this.taskRepository.findAll();
  }

  async create(data: Omit<ITask, 'id'>, creatorId: number): Promise<Task> {
    const creator = await this.userRepository.findById(creatorId);
    if (!creator) {
      throw new Error('Criador não encontrado');
    }

    if (data.isGlobal) {
      if (!this.canCreateGlobalQuest(creator)) {
        throw new Error('Usuário não tem permissão para criar quests globais');
      }
      data.assignedTo = null;
      data.projectId = null;
      data.taskVisibility = 'public';
    } else {
      if (data.projectId) {
        const project = await this.projectRepository.findById(data.projectId);
        if (!project) {
          throw new Error('Projeto não encontrado');
        }
      }

      if (data.assignedTo) {
        const assignee = await this.userRepository.findById(data.assignedTo);
        if (!assignee) {
          throw new Error('Usuário não encontrado');
        }
      }
    }

    const task = Task.create(data);
    const createdTask = await this.taskRepository.create(task);

    return createdTask;
  }

  async update(id: number, data: Partial<Task>, userId: number): Promise<Task> {
    const existingTask = await this.taskRepository.findById(id);
    if (!existingTask) {
      throw new Error('Tarefa não encontrada');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const userRoles = user.roles || [];
    let canModifyCompleted = this.identityAccess.hasAnyRole(userRoles, [
      'COORDENADOR',
      'LABORATORISTA',
      'GERENTE_PROJETO',
      'GERENTE',
    ]);

    if (!canModifyCompleted && existingTask.projectId) {
      const project = await this.projectRepository.findById(existingTask.projectId);
      if (project && (project.createdBy === userId || project.leaderId === userId)) {
        canModifyCompleted = true;
      }
    }

    if (existingTask.completed && !canModifyCompleted) {
      throw new Error('Não é possível modificar tarefas concluídas sem permissões adequadas');
    }

    if (data.assignedTo) {
      const assignee = await this.userRepository.findById(data.assignedTo);
      if (!assignee) {
        throw new Error('Usuário não encontrado');
      }
    }

    if (data.title !== undefined) {
      existingTask.setTitle(data.title);
    }
    if (data.description !== undefined) {
      existingTask.setDescription(data.description!);
    }
    if (data.priority !== undefined) {
      existingTask.setPriority(data.priority);
    }
    if (data.status !== undefined) {
      const oldStatus = existingTask.status;
      existingTask.setStatus(data.status);
      
      if (oldStatus !== 'in-review' && data.status === 'in-review' && existingTask.projectId) {
        const project = await this.projectRepository.findById(existingTask.projectId);
        if (project && project.leaderId) {
          await this.publishTaskReviewRequest(
            existingTask.id!,
            existingTask.title,
            userId,
            project.leaderId,
          );
        }
      }
    }
    if (data.assignedTo !== undefined) {
      existingTask.assignTo(data.assignedTo!);
    }
    if (data.points !== undefined) {
      existingTask.updatePoints(data.points);
    }
    if (data.dueDate !== undefined) {
      existingTask.setDueDate(data.dueDate);
    }

    const updatedTask = await this.taskRepository.update(id, existingTask);

    return updatedTask;
  }

  async delete(id: number, userId: number): Promise<void> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error('Tarefa não encontrada');
    }

    await this.taskRepository.delete(id);
  }

  async findByAssigneeId(userId: number): Promise<Task[]> {
    return await this.taskRepository.findByAssigneeId(userId);
  }

  async getTasksByUser(userId: number): Promise<Task[]> {
    return await this.taskRepository.findByAssigneeId(userId);
  }

  async getTasksByProject(projectId: number): Promise<Task[]> {
    return await this.taskRepository.findByProjectId(projectId);
  }

  async getProjectsForUser(userId: number): Promise<{ id: number }[]> {
    const memberships = await this.userRepository.getUserProjectMemberships(userId);
    return memberships.map(membership => ({ id: membership.projectId }));
  }

  async getTasksForUser(userId: number, userRoles: string[]): Promise<Task[]> {
    const hasManageTasksPermission = this.identityAccess.hasAnyRole(userRoles, [
      'COORDENADOR',
      'GERENTE',
      'COLABORADOR',
    ]);

    if (hasManageTasksPermission) {
      return await this.taskRepository.findAll();
    }

    return await this.taskRepository.findByAssigneeId(userId);
  }

  async getGlobalTasks(): Promise<Task[]> {
    const tasks = (await this.taskRepository.findAll()).filter((task => task.isGlobal || task.taskVisibility === 'public'))
    if(!tasks) return []
    return tasks
  }

  async completeTask(taskId: number, userId: number): Promise<Task> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error('Tarefa não encontrada');
    }

    if (task.completed) {
      throw new Error('Tarefa já concluída');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    if (task.projectId && this.identityAccess.hasAnyRole(user.roles, ['GERENTE_PROJETO'])) {
      const project = await this.projectRepository.findById(task.projectId);
      if (project && project.leaderId === userId && task.assignedTo === userId) {
        throw new Error('Líderes de projeto não podem concluir suas próprias tasks. Delegue para outro membro da equipe.');
      }
    }

    task.complete();
    const updatedTask = await this.taskRepository.update(taskId, task);
    
    const latePenalty = this.calculateLatePenalty(task, new Date());
    const pointsToAward = task.points - latePenalty;
    
    if (pointsToAward !== 0) {
      user.incrementCompletedTasks();
      await this.userRepository.update(user);
    }
    
    await this.publishTaskCompletionAward(userId, taskId, pointsToAward);
    
    return updatedTask;
  }

  async approveTask(taskId: number, leaderId: number): Promise<Task> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error('Tarefa não encontrada');
    }

    if (task.status !== 'in-review') {
      throw new Error('Tarefa não está em revisão');
    }

    const approver = await this.userRepository.findById(leaderId);
    if (!approver) {
      throw new Error('Usuário aprovador não encontrado');
    }

    const canApproveAnyTask = this.identityAccess.hasPermission(approver.roles, 'MANAGE_USERS');
    
    const canApproveProjectTask =
      this.identityAccess.hasAnyRole(approver.roles, ['GERENTE_PROJETO']) &&
      task.projectId !== null &&
      task.projectId !== undefined;
    
    if (!canApproveAnyTask) {
      if (canApproveProjectTask) {
        const project = await this.projectRepository.findById(task.projectId!);
        if (!project || project.leaderId !== leaderId) {
          throw new Error('Usuário não é líder do projeto');
        }
      } else {
        throw new Error('Usuário não tem permissão para aprovar esta tarefa');
      }
    }

    task.updateStatus('done');
    task.markAsCompleted();
    
    const updatedTask = await this.taskRepository.update(taskId, task);

    if (task.assignedTo) {
      const user = await this.userRepository.findById(task.assignedTo);
      if (user && task.points > 0) {
        const latePenalty = this.calculateLatePenalty(task, new Date());
        const pointsToAward = task.points - latePenalty;

        user.incrementCompletedTasks();
        await this.userRepository.update(user);
        await this.publishTaskCompletionAward(task.assignedTo, taskId, pointsToAward);
      }

      await this.publishTaskApproved(taskId, task.title, task.assignedTo);
    }

    return updatedTask;
  }

  async rejectTask(taskId: number, leaderId: number, reason?: string): Promise<Task> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error('Tarefa não encontrada');
    }

    if (task.status !== 'in-review') {
      throw new Error('Tarefa não está em revisão');
    }

    const approver = await this.userRepository.findById(leaderId);
    if (!approver) {
      throw new Error('Usuário aprovador não encontrado');
    }

    const canRejectAnyTask = this.identityAccess.hasPermission(approver.roles, 'MANAGE_USERS');
    
    const canRejectProjectTask =
      this.identityAccess.hasAnyRole(approver.roles, ['GERENTE_PROJETO']) &&
      task.projectId !== null &&
      task.projectId !== undefined;
    
    if (!canRejectAnyTask) {
      if (canRejectProjectTask) {
        const project = await this.projectRepository.findById(task.projectId!);
        if (!project || project.leaderId !== leaderId) {
          throw new Error('Usuário não é líder do projeto');
        }
      } else {
        throw new Error('Usuário não tem permissão para rejeitar esta tarefa');
      }
    }

    task.updateStatus('adjust');
    const updatedTask = await this.taskRepository.update(taskId, task);

    if (task.assignedTo) {
      await this.publishTaskRejected(taskId, task.title, task.assignedTo, reason);
    }

    return updatedTask;
  }

  private canCreateGlobalQuest(user: any): boolean {
    return this.identityAccess.hasPermission(user?.roles, 'MANAGE_USERS');
  }

  private async publishTaskReviewRequest(taskId: number, taskTitle: string, userId: number, projectLeaderId: number) {
    try {
      const user = await this.userRepository.findById(userId)
      const userName = user?.name || 'Um usuário'
      await this.notificationsModule.publishEvent({
        eventType: 'TASK_REVIEW_REQUEST',
        title: 'Tarefa em Revisão',
        message: `${userName} marcou a tarefa "${taskTitle}" como "Em Revisão"`,
        data: {
          taskId,
          taskTitle,
          userId,
          userName,
        },
        triggeredByUserId: userId,
        audience: {
          mode: 'USER_IDS',
          userIds: [projectLeaderId],
        },
      })
    } catch (error) {
      console.error('Erro ao publicar notificação TASK_REVIEW_REQUEST:', error)
    }
  }

  private async publishTaskApproved(taskId: number, taskTitle: string, userId: number) {
    try {
      await this.notificationsModule.publishEvent({
        eventType: 'TASK_APPROVED',
        title: 'Tarefa Aprovada',
        message: `Sua tarefa "${taskTitle}" foi aprovada! Você recebeu os pontos.`,
        data: {
          taskId,
          taskTitle,
        },
        audience: {
          mode: 'USER_IDS',
          userIds: [userId],
        },
      })
    } catch (error) {
      console.error('Erro ao publicar notificação TASK_APPROVED:', error)
    }
  }

  private async publishTaskRejected(taskId: number, taskTitle: string, userId: number, reason?: string) {
    const message = reason
      ? `Sua tarefa "${taskTitle}" precisa de ajustes. Motivo: ${reason}`
      : `Sua tarefa "${taskTitle}" precisa de ajustes.`
    try {
      await this.notificationsModule.publishEvent({
        eventType: 'TASK_REJECTED',
        title: 'Tarefa Rejeitada',
        message,
        data: {
          taskId,
          taskTitle,
          reason,
        },
        audience: {
          mode: 'USER_IDS',
          userIds: [userId],
        },
      })
    } catch (error) {
      console.error('Erro ao publicar notificação TASK_REJECTED:', error)
    }
  }

  private calculateLatePenalty(task: Task, completionDate: Date): number {
    if (!task.dueDate) {
      return 0;
    }

    const dueDate = new Date(task.dueDate);
    
    const timeDiff = completionDate.getTime() - dueDate.getTime();
    const daysLate = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    if (daysLate <= 0) {
      return 0;
    }

    const penalty = daysLate * task.points;
    
    console.log(`Task ${task.id} atrasada por ${daysLate} dias. Penalização: ${penalty} pontos (${daysLate} × ${task.points})`);
    
    return penalty;
  }

  private async publishTaskCompletionAward(userId: number, taskId: number, taskPoints: number) {
    try {
      await this.taskProgressEvents.onTaskCompleted({
        userId,
        taskId,
        taskPoints,
      });
    } catch (error) {
      console.error('Erro ao publicar progressão de gamificação para conclusão de task:', error);
    }
  }
}
