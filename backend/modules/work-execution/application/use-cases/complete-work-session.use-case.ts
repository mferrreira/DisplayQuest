import type { CompleteWorkSessionCommand } from "@/backend/modules/work-execution/application/contracts"
import type { WorkExecutionGateway } from "@/backend/modules/work-execution/application/ports/work-execution.gateway"
import type { WorkExecutionEvents } from "@/backend/modules/work-execution/application/ports/work-execution.events"

export class CompleteWorkSessionUseCase {
  constructor(
    private readonly gateway: WorkExecutionGateway,
    private readonly events?: WorkExecutionEvents,
  ) {}

  async execute(command: CompleteWorkSessionCommand) {
    const session = await this.gateway.completeWorkSession(command)
    if (this.events && session.isCompleted()) {
      try {
        await this.events.onWorkSessionCompleted({
          session,
          completedTaskIds: command.completedTaskIds,
        })
      } catch (error) {
        console.error("Erro ao publicar evento de conclusão de sessão para gamificação:", error)
      }
    }

    return session
  }
}
