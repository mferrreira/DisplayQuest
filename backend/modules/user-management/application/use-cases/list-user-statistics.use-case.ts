import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** ListUserStatisticsUseCase — dispatch frozen by the golden (roles/status/general/default). */
export class ListUserStatisticsUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(type?: string | null) {
    switch (type) {
      case "roles":
        return await this.repository.getUsersByRole()
      case "status":
        return await this.repository.getUsersByStatus()
      case "general":
      default:
        return await this.repository.getUserStatistics()
    }
  }
}
