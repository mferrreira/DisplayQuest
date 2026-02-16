import { prisma } from '@/lib/database/prisma';
import { Task, TaskStatus, TaskPriority, TaskVisibility } from '../models/Task';

export interface ITaskRepository {
  findById(id: number): Promise<Task | null>;
  findAll(): Promise<Task[]>;
  create(task: Task): Promise<Task>;
  update(id: number, task: Task): Promise<Task>;
  delete(id: number): Promise<void>;
  findByProjectId(projectId: number): Promise<Task[]>;
  findByAssigneeId(userId: number): Promise<Task[]>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findByPriority(priority: TaskPriority): Promise<Task[]>;
  findByVisibility(visibility: TaskVisibility): Promise<Task[]>;
  findOverdue(): Promise<Task[]>;
  findCompleted(): Promise<Task[]>;
  findPending(): Promise<Task[]>;
  findByDateRange(startDate: string, endDate: string): Promise<Task[]>;
  findTasksByUserAndProject(userId: number, projectId: number): Promise<Task[]>;
  findTasksByUserAndStatus(userId: number, status: TaskStatus): Promise<Task[]>;
  countByProject(projectId: number): Promise<number>;
  countByAssignee(userId: number): Promise<number>;
  countByStatus(status: TaskStatus): Promise<number>;
}

export class TaskRepository implements ITaskRepository {
  private getIncludeOptions() {
    return {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          roles: true
        }
      },
      projectObj: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true
        }
      }
    };
  }

  async findById(id: number): Promise<Task | null> {
    const data = await prisma.tasks.findUnique({
      where: { id },
      include: this.getIncludeOptions()
    });
    return data ? Task.fromPrisma(data) : null;
  }

  async findAll(): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async create(task: Task): Promise<Task> {
    const data = await prisma.tasks.create({
      data: task.toPrisma(),
      include: this.getIncludeOptions()
    });
    return Task.fromPrisma(data);
  }

  async update(id: number, task: Task): Promise<Task> {
    const data = await prisma.tasks.update({
      where: { id },
      data: task.toPrisma(),
      include: this.getIncludeOptions()
    });
    return Task.fromPrisma(data);
  }

  async delete(id: number): Promise<void> {
    await prisma.tasks.delete({
      where: { id }
    });
  }

  async findByProjectId(projectId: number): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { projectId },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findByAssigneeId(userId: number): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { assignedTo: userId },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { status },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findByPriority(priority: TaskPriority): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { priority },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findByVisibility(visibility: TaskVisibility): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { taskVisibility: visibility },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findOverdue(): Promise<Task[]> {
    const now = new Date().toISOString();
    const data = await prisma.tasks.findMany({
      where: {
        dueDate: { lt: now },
        completed: false
      },
      include: this.getIncludeOptions(),
      orderBy: { dueDate: 'asc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findCompleted(): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { completed: true },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findPending(): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: { completed: false },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findByDateRange(startDate: string, endDate: string): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: {
        dueDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: this.getIncludeOptions(),
      orderBy: { dueDate: 'asc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findTasksByUserAndProject(userId: number, projectId: number): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: {
        assignedTo: userId,
        projectId: projectId
      },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async findTasksByUserAndStatus(userId: number, status: TaskStatus): Promise<Task[]> {
    const data = await prisma.tasks.findMany({
      where: {
        assignedTo: userId,
        status: status
      },
      include: this.getIncludeOptions(),
      orderBy: { id: 'desc' }
    });
    return data.map(task => Task.fromPrisma(task));
  }

  async countByProject(projectId: number): Promise<number> {
    return await prisma.tasks.count({
      where: { projectId }
    });
  }

  async countByAssignee(userId: number): Promise<number> {
    return await prisma.tasks.count({
      where: { assignedTo: userId }
    });
  }

  async countByStatus(status: TaskStatus): Promise<number> {
    return await prisma.tasks.count({
      where: { status }
    });
  }
}
