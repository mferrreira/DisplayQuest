import type { WorkSession } from "@/backend/models/WorkSession"
import type { DailyLog } from "@/backend/models/DailyLog"
import type {
  StartWorkSessionCommand,
  CompleteWorkSessionCommand,
  CreateDailyLogFromSessionCommand,
  ListWorkSessionsQuery,
  DeleteWorkSessionCommand,
  UpdateWorkSessionCommand,
} from "@/backend/modules/work-execution/application/contracts"

export interface WorkExecutionGateway {
  startWorkSession(command: StartWorkSessionCommand): Promise<WorkSession>
  completeWorkSession(command: CompleteWorkSessionCommand): Promise<WorkSession>
  createDailyLogFromSession(command: CreateDailyLogFromSessionCommand): Promise<DailyLog>
  listWorkSessions(query: ListWorkSessionsQuery): Promise<WorkSession[]>
  deleteWorkSession(command: DeleteWorkSessionCommand): Promise<void>
  updateWorkSession(command: UpdateWorkSessionCommand): Promise<WorkSession>
  getSessionById(sessionId: number): Promise<WorkSession | null>
}
