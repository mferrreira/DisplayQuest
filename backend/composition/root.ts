import { createGamificationModule } from "@/backend/modules/gamification"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"
import { NotificationsLabPublisher } from "@/backend/modules/lab-operations/infrastructure/adapters/notifications-lab-publisher"
import { createNotificationsModule } from "@/backend/modules/notifications"
import { NotificationsReportPublisher } from "@/backend/modules/reporting/infrastructure/publishers/notifications-report-publisher"
import { createProjectMembershipModule } from "@/backend/modules/project-membership"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import { createReportingModule } from "@/backend/modules/reporting"
import { createStoreModule } from "@/backend/modules/store"
import { createTaskManagementModule } from "@/backend/modules/task-management"
import { createTaskProgressEvents } from "@/backend/modules/task-management/infrastructure/gamification-task-progress.events"
import { createUserManagementModule } from "@/backend/modules/user-management"
import { createWorkExecutionModule } from "@/backend/modules/work-execution"
import { createWorkExecutionEventsPublisher } from "@/backend/modules/work-execution/infrastructure/work-execution-events.publisher"
import { prisma } from "@/lib/database/prisma"

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
  const userManagement = createUserManagementModule()

  const taskManagement = createTaskManagementModule({
    notifications,
    events: createTaskProgressEvents({ awards: gamification }),
  })

  const projectManagement = createProjectManagementModule()

  const projectMembership = createProjectMembershipModule()

  const labOperations = createLabOperationsModule({
    // DEC-21 (ond8): os eventos de issue saem por PORTA LOCAL (LabIssuePublisherPort);
    // o modulo de notificacoes e injetado AQUI (a infra de lab nao importa factory de
    // outro modulo — RG-04). Wiring nova: use cases sobre portas finas.
    ports: {
      publisher: new NotificationsLabPublisher(notifications),
    },
  })

  const store = createStoreModule()
  const reporting = createReportingModule({
    // DEC-21: o evento de relatório sai por PORTA LOCAL; o módulo de notificações é
    // injetado AQUI (a infra de reporting não importa factory de outro módulo — RG-04).
    ports: {
      publisher: new NotificationsReportPublisher(notifications),
    },
  })

  const workExecution = createWorkExecutionModule({
    events: createWorkExecutionEventsPublisher({ awards: gamification }),
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

/**
 * OND9-B1 (RG-06): probe de saude do banco exposto PELA COMPOSITION ROOT — a rota
 * /api/health parou de instanciar um PrismaClient proprio (passa a compartilhar o client
 * do app). Body/status da rota permanecem identicos.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error("Health check failed:", error)
    return false
  }
}
