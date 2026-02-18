export type TaskStatus = 'to-do' | 'in-progress' | 'in-review' | 'adjust' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskVisibility = 'public' | 'delegated' | 'private';

export interface ITask {
  id?: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: number | null;
  projectId?: number | null;
  dueDate?: string | null;
  points: number;
  completed: boolean;
  completedAt?: Date | string | null;
  taskVisibility: TaskVisibility;
  isGlobal?: boolean;
}

export class Task {
  public id?: number;
  public title: string;
  public description?: string | null;
  public status: TaskStatus;
  public priority: TaskPriority;
  public assignedTo?: number | null;
  public projectId?: number | null;
  public dueDate?: string | null;
  public points: number;
  public completed: boolean;
  public completedAt?: Date | null;
  public taskVisibility: TaskVisibility;
  public isGlobal: boolean;

  constructor(data: ITask) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.status = data.status;
    this.priority = data.priority;
    this.assignedTo = data.assignedTo;
    this.projectId = data.projectId;
    this.dueDate = data.dueDate;
    this.points = data.points;
    this.completed = data.completed;
    this.completedAt = data.completedAt ? new Date(data.completedAt) : null;
    this.taskVisibility = data.taskVisibility;
    this.isGlobal = data.isGlobal || false;
  }

  static create(data: Omit<ITask, 'id'>): Task {
    const title = String(data.title || '').trim();
    if (!title) throw new Error('Título da tarefa é obrigatório');
    if (title.length > 200) throw new Error('Título da tarefa não pode ter mais de 200 caracteres');
    if (data.description && data.description.length > 1000) {
      throw new Error('Descrição da tarefa não pode ter mais de 1000 caracteres');
    }
    if ((data.points || 0) < 0) throw new Error('Pontos da tarefa não podem ser negativos');

    return new Task({
      title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      assignedTo: data.assignedTo || null,
      projectId: data.projectId || null,
      dueDate: data.dueDate || null,
      points: data.points || 0,
      completed: data.completed || false,
      completedAt: data.completed || data.status === "done" ? new Date() : null,
      taskVisibility: data.taskVisibility || 'delegated',
      isGlobal: data.isGlobal || false,
    });
  }

  static fromPrisma(data: any): Task {
    return new Task({
      id: data.id,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      assignedTo: data.assignedTo,
      projectId: data.projectId,
      dueDate: data.dueDate,
      points: data.points,
      completed: data.completed,
      completedAt: data.completedAt,
      taskVisibility: data.taskVisibility,
      isGlobal: data.isGlobal || false,
    });
  }

  toPrisma(): any {
    return {
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      assignedTo: this.assignedTo,
      projectId: this.projectId,
      dueDate: this.dueDate,
      points: this.points,
      completed: this.completed,
      completedAt: this.completedAt || null,
      taskVisibility: this.taskVisibility,
      isGlobal: this.isGlobal,
    };
  }

  toJSON(): any {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      assignedTo: this.assignedTo,
      projectId: this.projectId,
      dueDate: this.dueDate,
      points: this.points,
      completed: this.completed,
      completedAt: this.completedAt ? this.completedAt.toISOString() : null,
      taskVisibility: this.taskVisibility,
      isGlobal: this.isGlobal,
    };
  }
}
