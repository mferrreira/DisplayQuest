import { NotFoundError } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/** DeleteUserUseCase — existence rule frozen by the golden (OND2-B2). */
export class DeleteUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(userId: number): Promise<void> {
    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }
    await this.repository.delete(userId)
  }
}
