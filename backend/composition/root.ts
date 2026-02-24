import { createGamificationModule } from "@/backend/modules/gamification"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"
import { createNotificationsModule } from "@/backend/modules/notifications"
import { createProjectMembershipModule } from "@/backend/modules/project-membership"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import { createReportingModule } from "@/backend/modules/reporting"
import { createStoreModule } from "@/backend/modules/store"
import { createTaskManagementModule } from "@/backend/modules/task-management"
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events"
import { createUserManagementModule } from "@/backend/modules/user-management"
import { createWorkExecutionModule } from "@/backend/modules/work-execution"
import { createWorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher"

export interface BackendComposition {
  identityAccess: ReturnType<typeof createIdentityAccessModule>
  notifications: ReturnType<typeof createNotificationsModule>
  gamification: ReturnType<typeof createGamificationModule>
  userManagement: ReturnType<typeof createUserManagementModule>
  taskManagement: ReturnType<typeof createTaskManagementModule>
  projectManagement: ReturnType<typeof createProjectManagementModule>
  projectMembership: ReturnType<typeof createProjectMembershipModule>
  labOperations: ReturnType<typeof createLabOperationsModule>
  store: ReturnType<typeof createStoreModule>
  reporting: ReturnType<typeof createReportingModule>
  workExecution: ReturnType<typeof createWorkExecutionModule>
}

export function createBackendComposition(): BackendComposition {
  const identityAccess = createIdentityAccessModule()
  const notifications = createNotificationsModule()
  const gamification = createGamificationModule()
  const userManagement = createUserManagementModule({
    gatewayDependencies: {
      identityAccess,
    },
  })

  const taskManagement = createTaskManagementModule({
    gatewayDependencies: {
      identityAccess,
      notificationsModule: notifications,
      taskProgressEvents: createTaskProgressEvents({ gamificationModule: gamification }),
    },
  })

  const projectManagement = createProjectManagementModule({
    gatewayDependencies: {
      identityAccess,
    },
  })

  const projectMembership = createProjectMembershipModule()

  const labOperations = createLabOperationsModule({
    gatewayDependencies: {
      identityAccess,
      notificationsModule: notifications,
    },
  })

  const store = createStoreModule()
  const reporting = createReportingModule()

  const workExecution = createWorkExecutionModule({
    eventsPublisher: createWorkExecutionEventsPublisher({
      gamificationModule: gamification,
    }),
  })

  return {
    identityAccess,
    notifications,
    gamification,
    userManagement,
    taskManagement,
    projectManagement,
    projectMembership,
    labOperations,
    store,
    reporting,
    workExecution,
  }
}

let compositionSingleton: BackendComposition | null = null

export function getBackendComposition(): BackendComposition {
  if (!compositionSingleton) {
    compositionSingleton = createBackendComposition()
  }

  return compositionSingleton
}
