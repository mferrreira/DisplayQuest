/**
 * Task fixtures — shapes mirror backend/models/Task.ts toJSON EXACTLY (entities/task.ts parses them).
 * Cover the matrix: visibility × status × overdue × global. pt-BR content (R9).
 */
import type { Task } from "@/entities/task";

let nextId = 100;

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId++,
    title: "Tarefa de teste",
    description: null,
    status: "to-do",
    priority: "medium",
    assignedTo: null,
    assigneeIds: [],
    projectId: null,
    dueDate: null,
    points: 10,
    completed: false,
    completedAt: null,
    taskVisibility: "delegated",
    isGlobal: false,
    ...overrides,
  };
}

/** daysAgo helper for deterministic overdue/archive fixtures. */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** The canonical board fixture set used by component tests and E2E MSW. */
export function boardFixture(): Task[] {
  return [
    makeTask({
      id: 1,
      title: "Checklist do laboratório",
      description: "Criar checklist público diário",
      status: "to-do",
      priority: "medium",
      taskVisibility: "public",
      points: 20,
      dueDate: isoDaysAgo(9), // overdue public task (penalty display)
    }),
    makeTask({
      id: 2,
      title: "Protótipo de modelo IA",
      description: "Primeira versão do classificador",
      status: "to-do",
      priority: "high",
      taskVisibility: "public",
      points: 60,
      dueDate: isoDaysAhead(5),
    }),
    makeTask({
      id: 3,
      title: "Documentar API de sessões",
      status: "in-progress",
      priority: "medium",
      assignedTo: 2,
      assigneeIds: [2],
      projectId: 1,
      dueDate: isoDaysAhead(2),
    }),
    makeTask({
      id: 4,
      title: "Revisar sensor de temperatura",
      status: "in-review",
      priority: "high",
      assignedTo: 3,
      assigneeIds: [3],
      projectId: 1,
      points: 30,
    }),
    makeTask({
      id: 5,
      title: "Corrigir script de importação",
      status: "adjust",
      priority: "medium",
      assignedTo: 2,
      assigneeIds: [2],
      projectId: 1,
      description: "Falha em arquivos grandes.\n\nFIX (01/08/2026): validar tamanho antes do parse",
    }),
    makeTask({
      id: 6,
      title: "Quest global: organizar bancada",
      status: "to-do",
      priority: "low",
      taskVisibility: "public",
      isGlobal: true,
      points: 15,
    }),
    makeTask({
      id: 7,
      title: "Tarefa concluída recente",
      status: "done",
      priority: "low",
      assignedTo: 2,
      assigneeIds: [2],
      completed: true,
      completedAt: isoDaysAgo(1), // stays on board (< 7 days)
      points: 10,
    }),
    makeTask({
      id: 8,
      title: "Tarefa concluída antiga",
      status: "done",
      priority: "low",
      assignedTo: 2,
      assigneeIds: [2],
      completed: true,
      completedAt: isoDaysAgo(12), // archived (> 7 days)
      points: 10,
    }),
  ];
}
