import type { ProjectRepositoryPort } from "@/backend/modules/project-management/application/ports/project.repository"

/** GetProjectByIdUseCase — OND5-B2 (R2). Raw read; access control lives in GetProjectForActor. */
export interface GetProjectByIdDependencies {
  projects: ProjectRepositoryPort
}

export class GetProjectByIdUseCase {
  constructor(private readonly dependencies: GetProjectByIdDependencies) {}

  async execute(projectId: number) {
    return await this.dependencies.projects.findById(projectId)
  }
}
