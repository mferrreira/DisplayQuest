import type { ActorRef } from "@/backend/domain"
import type { ProjectActivityRecord } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"
import type { ProjectCronogramaPort } from "@/backend/modules/project-management/application/ports/project-cronograma.repository"

/**
 * ListAllProjectActivitiesUseCase — plan-v13 S04 (regra 7).
 *
 * A leitura agregada das atividades de cronograma de TODOS os projetos para a tela de
 * gráficos do Dashboard. Não há gate: projeto e as partes dele são do autenticado
 * (DEC-136) — o que a rota faz é autenticar. O `actor` entra para o registro de quem
 * lê; a regra de escopo é a abertura medida, não uma checagem que responderia "não".
 *
 * A linha devolve os campos que a tela consome: os gráficos derivam a janela, o recorte
 * e o atraso na tela (S05), e a regra de calendário é a única em `backend/domain` — a
 * rota não reimplementa nada.
 */
export interface ListAllProjectActivitiesDependencies {
  cronograma: ProjectCronogramaPort
}

export interface ProjectActivitySummary {
  id: number
  projectId: number
  order: number
  status: string
  firstMonth: string
  lastMonth: string
}

export class ListAllProjectActivitiesUseCase {
  constructor(private readonly dependencies: ListAllProjectActivitiesDependencies) {}

  async execute(_actor: ActorRef): Promise<ProjectActivitySummary[]> {
    const rows = await this.dependencies.cronograma.listAllActivities()
    return rows.map((row: ProjectActivityRecord) => ({
      id: row.id,
      projectId: row.projectId,
      order: row.order,
      status: row.status,
      firstMonth: row.firstMonth,
      lastMonth: row.lastMonth,
    }))
  }
}
