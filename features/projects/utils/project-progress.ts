import { projectTimeProgress } from "@/backend/domain"

export interface ProjectProgressInput {
  id: number
  startDate?: string | null
  endDate?: string | null
}

export interface ProjectProgressInfo {
  percent: number
  source: "time" | "tasks"
  completedTasks: number
  totalTasks: number
  detail: string
}

/** O andamento do projeto é temporal; tarefas são fallback quando não há período completo. */
export function projectProgress(
  project: ProjectProgressInput,
  tasks: ReadonlyArray<{ projectId?: number | null; status: string }>,
  today: string,
): ProjectProgressInfo {
  const projectTasks = tasks.filter((task) => task.projectId === project.id)
  const completedTasks = projectTasks.filter((task) => task.status === "done").length
  const totalTasks = projectTasks.length

  if (project.startDate && project.endDate) {
    const time = projectTimeProgress(project, today)
    return {
      percent: time.percent,
      source: "time",
      completedTasks,
      totalTasks,
      detail: `${time.percent}% do período decorrido`,
    }
  }

  const percent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0
  return {
    percent,
    source: "tasks",
    completedTasks,
    totalTasks,
    detail: `${completedTasks} de ${totalTasks} tarefas concluídas`,
  }
}
