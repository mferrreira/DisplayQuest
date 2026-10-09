import type { CronStatus } from "@/backend/modules/work-execution/application/ports/cron-operations.port"
import { requireCronOperator } from "@/backend/modules/work-execution/application/use-cases/internal/require-cron-operator"

/**
 * GetCronStatusUseCase (B6-1b, D4) — reads the scheduler status for an actor that may operate it.
 *
 * This is the enforcement the route used to do before touching the service. Nothing about the
 * payload changed: the port returns exactly what the scheduler reported.
 */
export interface CronOperatorCommand {
  actorRoles: unknown
}

export class GetCronStatusUseCase {
  constructor(private readonly getStatus: () => Promise<CronStatus>) {}

  async execute(command: CronOperatorCommand): Promise<CronStatus> {
    requireCronOperator(command.actorRoles)
    return await this.getStatus()
  }
}