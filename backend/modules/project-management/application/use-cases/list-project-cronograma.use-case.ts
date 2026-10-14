import { NotFoundError, activityPeriod, activityReward, cronogramaMonthColumns, isActivityCurrent, monthKeysBetween } from "@/backend/domain"
import type { ListProjectCronogramaQuery } from "@/backend/modules/project-management/application/contracts"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/**
 * ListProjectCronogramaUseCase — V5-5 (DEC-126/127/151). A leitura da aba Cronograma.
 *
 * Não há gate de leitura: projeto e as partes dele são do autenticado (DEC-136), e o que existe
 * aqui é o 404 de projeto inexistente. Escrita é outra porta (`AssertCanManageProject`).
 *
 * O que o use case acrescenta ao que o port devolve é o que a grade precisa e não está no banco:
 *   `months`        as colunas (DEC-151: o período do projeto; sem datas, 12 meses desde hoje)
 *   `months` da linha, `periodoInicio`, `periodoFim`, `reward`, `current`  derivados da regra
 *                     pura a partir de `firstMonth`/`lastMonth` (DEC-126a/DEC-103)
 *
 * Derivar aqui, e não guardar no banco, é o que impede o período armazenado de divergir das
 * marcas quando a pessoa mexe na grade (lição da DEC-90: mock/coluna que repete a regra fica
 * verde com a produção mentindo).
 */
export interface ListProjectCronogramaDependencies {
  projects: ProjectRepositoryPort
  cronograma: ProjectCronogramaPort
}

export class ListProjectCronogramaUseCase {
  constructor(private readonly dependencies: ListProjectCronogramaDependencies) {}

  async execute(query: ListProjectCronogramaQuery) {
    const project = await this.dependencies.projects.findById(query.projectId)
    if (!project) {
      throw new NotFoundError("Projeto não encontrado")
    }

    const goals = await this.dependencies.cronograma.listGoals(query.projectId)
    const activities = await this.dependencies.cronograma.listActivities(query.projectId)

    const ranges = activities.map((activity) => ({
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
    }))

    const months = cronogramaMonthColumns({
      startDate: project.startDate ?? null,
      endDate: project.endDate ?? null,
      today: query.today,
      markedRanges: ranges,
    })

    return {
      projectId: query.projectId,
      months,
      goals,
      activities: activities.map((activity) => {
        const range = { firstMonth: activity.firstMonth, lastMonth: activity.lastMonth }
        const { periodoInicio, periodoFim } = activityPeriod(range.firstMonth, range.lastMonth)
        return {
          ...activity,
          months: monthKeysBetween(range.firstMonth, range.lastMonth),
          periodoInicio,
          periodoFim,
          reward: activityReward(range.firstMonth, range.lastMonth),
          current: isActivityCurrent(range, query.today),
        }
      }),
    }
  }
}
