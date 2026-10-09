import { ValidationError } from "@/backend/domain"
import type { CronOperatorCommand } from "@/backend/modules/work-execution/application/use-cases/get-cron-status.use-case"
import { requireCronOperator } from "@/backend/modules/work-execution/application/use-cases/internal/require-cron-operator"

/**
 * ExecuteManualCronResetUseCase (B6-1b, D4) — runs a manual action on the scheduler.
 *
 * The action travels in the command, not in the route, and that is deliberate: the route used
 * to check the role BEFORE reading the body, so an unauthorised POST with an unknown action
 * answered 403, not 400. Keeping the dispatch behind the gate is the only way to preserve that
 * ordering — a route that validated the action first would flip those two cases.
 *
 * `manual-reset` is the only action the scheduler accepts. Unknown actions raise the frozen
 * message "Ação não reconhecida" (was a bare `NextResponse.json(..., 400)` in the route; it is
 * now a typed ValidationError, so the body gains `code`/`details` alongside the same `error`).
 */
export interface ManualCronActionCommand extends CronOperatorCommand {
  action: unknown
}

export const MANUAL_RESET_ACTION = "manual-reset"

export const UNKNOWN_CRON_ACTION_MESSAGE = "Ação não reconhecida"

export class ExecuteManualCronResetUseCase {
  constructor(private readonly executeManualReset: () => Promise<void>) {}

  async execute(command: ManualCronActionCommand): Promise<{ message: string }> {
    requireCronOperator(command.actorRoles)

    if (command.action !== MANUAL_RESET_ACTION) {
      throw new ValidationError(UNKNOWN_CRON_ACTION_MESSAGE)
    }

    await this.executeManualReset()
    return { message: "Reset manual executado com sucesso" }
  }
}