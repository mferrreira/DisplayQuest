import { GetTaskByIdUseCase } from "@/backend/modules/task-management/application/use-cases/get-task-by-id.use-case"
import { ListTasksForActorUseCase } from "@/backend/modules/task-management/application/use-cases/list-tasks-for-actor.use-case"
import { ListActorProjectIdsUseCase } from "@/backend/modules/task-management/application/use-cases/list-actor-project-ids.use-case"
import { CreateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/create-task.use-case"
import { UpdateTaskUseCase } from "@/backend/modules/task-management/application/use-cases/update-task.use-case"
import { DeleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/delete-task.use-case"
import { CompleteTaskUseCase } from "@/backend/modules/task-management/application/use-cases/complete-task.use-case"
import { ApproveTaskUseCase } from "@/backend/modules/task-management/application/use-cases/approve-task.use-case"
import { RejectTaskUseCase } from "@/backend/modules/task-management/application/use-cases/reject-task.use-case"
import { createTaskManagementGateway } from "@/backend/modules/task-management/infrastructure/task-service.gateway"

type UseCaseExecute<T> = T extends { execute: (...args: infer A) => infer R } ? (...args: A) => R : never

export class TaskManagementModule {
  readonly getTaskById: UseCaseExecute<GetTaskByIdUseCase>
  readonly listTasksForActor: UseCaseExecute<ListTasksForActorUseCase>
  readonly listActorProjectIds: UseCaseExecute<ListActorProjectIdsUseCase>
  readonly createTask: UseCaseExecute<CreateTaskUseCase>
  readonly updateTask: UseCaseExecute<UpdateTaskUseCase>
  readonly deleteTask: UseCaseExecute<DeleteTaskUseCase>
  readonly completeTask: UseCaseExecute<CompleteTaskUseCase>
  readonly approveTask: UseCaseExecute<ApproveTaskUseCase>
  readonly rejectTask: UseCaseExecute<RejectTaskUseCase>

  constructor(
    private readonly getTaskByIdUseCase: GetTaskByIdUseCase,
    private readonly listTasksForActorUseCase: ListTasksForActorUseCase,
    private readonly listActorProjectIdsUseCase: ListActorProjectIdsUseCase,
    private readonly createTaskUseCase: CreateTaskUseCase,
    private readonly updateTaskUseCase: UpdateTaskUseCase,
    private readonly deleteTaskUseCase: DeleteTaskUseCase,
    private readonly completeTaskUseCase: CompleteTaskUseCase,
    private readonly approveTaskUseCase: ApproveTaskUseCase,
    private readonly rejectTaskUseCase: RejectTaskUseCase,
  ) {
    this.getTaskById = this.getTaskByIdUseCase.execute.bind(this.getTaskByIdUseCase)
    this.listTasksForActor = this.listTasksForActorUseCase.execute.bind(this.listTasksForActorUseCase)
    this.listActorProjectIds = this.listActorProjectIdsUseCase.execute.bind(this.listActorProjectIdsUseCase)
    this.createTask = this.createTaskUseCase.execute.bind(this.createTaskUseCase)
    this.updateTask = this.updateTaskUseCase.execute.bind(this.updateTaskUseCase)
    this.deleteTask = this.deleteTaskUseCase.execute.bind(this.deleteTaskUseCase)
    this.completeTask = this.completeTaskUseCase.execute.bind(this.completeTaskUseCase)
    this.approveTask = this.approveTaskUseCase.execute.bind(this.approveTaskUseCase)
    this.rejectTask = this.rejectTaskUseCase.execute.bind(this.rejectTaskUseCase)
  }
}

export function createTaskManagementModule() {
  const gateway = createTaskManagementGateway()
  return new TaskManagementModule(
    new GetTaskByIdUseCase(gateway),
    new ListTasksForActorUseCase(gateway),
    new ListActorProjectIdsUseCase(gateway),
    new CreateTaskUseCase(gateway),
    new UpdateTaskUseCase(gateway),
    new DeleteTaskUseCase(gateway),
    new CompleteTaskUseCase(gateway),
    new ApproveTaskUseCase(gateway),
    new RejectTaskUseCase(gateway),
  )
}
