import { ConflictError, NotFoundError, requireActorPermission } from "@/backend/domain"
import type { ActorRef } from "@/backend/domain"
import type { UserRepositoryPort } from "@/backend/modules/user-management/application/ports/user.repository"

/**
 * DeleteUserUseCase — existence rule frozen by the golden (OND2-B2), plus the dependency refusal
 * added in V4-1 (DEC-55).
 *
 * The order is the whole point of the batch: `findById` → `countBlockingDependencies` → `delete`.
 * Before this, the use case called `delete` directly and let the database decide. 16 of the 23
 * foreign keys pointing at `users` are `RESTRICT` (Prisma's default, no `onDelete`), so any user
 * who had ever created a project, made a purchase, held a responsibility, written a daily log or
 * received a weekly report failed with P2003 — and the route returned 500 carrying Prisma's raw
 * message, `Invalid prisma.users.delete() invocation` and all, because `domainErrorResponse`
 * returns `null` for a non-DomainError and the catch falls back to `error.message`.
 *
 * Refusing before the call turns that into a 409 with a sentence a person can act on, and leaves
 * the case that already worked working: a registration with no history is still deleted for real.
 * The alternative the owner rejected was `onDelete: Cascade` on those 16 keys — it would make the
 * DELETE succeed by erasing the tasks, purchases, logs and reports that the weekly reports are
 * built from.
 *
 * The message names no table and no constraint on purpose: what the client needs is the
 * alternative (inactivate), not the schema. Inactivation already works end to end and is not
 * introduced here — `lib/auth/config.ts:30` blocks login, `lib/auth/server-auth.ts:36` blocks the
 * API, the lab rules refuse users who are not `active`, bulk weekly reports and the cron weekly
 * reset skip them. The status that does this is `suspended` ("Suspender" in the panel): DEC-95
 * standardized the vocabulary and `inactive` is not a status the system writes.
 */
export class DeleteUserUseCase {
  constructor(private readonly repository: UserRepositoryPort) {}

  async execute(actor: ActorRef, userId: number): Promise<void> {
    // B6-4 (D4): MANAGE_USERS PURO (mensagem default "Acesso negado", a da rota). Excluir
    // usuario NAO e caminho self — DEC-55 ja tinha medido que o caminho de inativacao e o
    // bloqueio por status, nao a exclusao por dono. O chamador interno (reject do fluxo de
    // aprovacao) traz a pessoa que moderou: o gate passa por ele, nao por um ator inventado.
    requireActorPermission(actor, "MANAGE_USERS")

    const user = await this.repository.findById(userId)
    if (!user) {
      throw new NotFoundError("Usuário não encontrado")
    }

    const dependents = await this.repository.countBlockingDependencies(userId)
    if (dependents > 0) {
      throw new ConflictError(
        "Usuário possui registros vinculados ao histórico do sistema e não pode ser excluído. Inative o usuário para remover o acesso.",
      )
    }

    await this.repository.delete(userId)
  }
}
