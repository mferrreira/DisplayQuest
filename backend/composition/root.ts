import { createGamificationModule } from "@/backend/modules/gamification"
import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createLabOperationsModule } from "@/backend/modules/lab-operations"
import { NotificationsLabPublisher } from "@/backend/modules/lab-operations/infrastructure/adapters/notifications-lab-publisher"
import { createNotificationsModule } from "@/backend/modules/notifications"
import { NotificationsReportPublisher } from "@/backend/modules/reporting/infrastructure/publishers/notifications-report-publisher"
import { createProjectMembershipModule } from "@/backend/modules/project-membership"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import { createGamificationActivityCompletionAward } from "@/backend/modules/project-management/infrastructure/adapters/gamification-activity-completion-award"
import { createNotificationsActivityOverdueNotifier } from "@/backend/modules/project-management/infrastructure/adapters/notifications-activity-overdue"
import { createPrismaProjectRepository } from "@/backend/modules/project-management/infrastructure/repositories/prisma-project.repository"
import { createReportingModule } from "@/backend/modules/reporting"
import { createAttestationModule } from "@/backend/modules/attestation"
import { createNotificationsCertificateReminderNotifier } from "@/backend/modules/attestation/infrastructure/adapters/notifications-certificate-reminder"
import { createStoreModule } from "@/backend/modules/store"
import { createTaskManagementModule } from "@/backend/modules/task-management"
import { createPrismaTaskActivityPort } from "@/backend/modules/task-management/infrastructure/adapters/prisma-task-activity"
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
  attestation: ReturnType<typeof createAttestationModule>
}

export function createBackendComposition(): BackendComposition {
  const identityAccess = createIdentityAccessModule()
  const notifications = createNotificationsModule()
  const gamification = createGamificationModule()
  const userManagement = createUserManagementModule()

  // V5-7b (DEC-21/63/74): o adaptador de `projects` é compartilhado — o módulo de projeto o
  // usa, e o publicador de conclusão de tarefa o usa para incrementar `projects.points`. O
  // piso 0 (DEC-74) é a escrita congelada dele e mora num lugar só; o módulo de tarefa só
  // conhece a porta local `TaskProjectPointsPort`, satisfeita estruturalmente.
  const projectsRepository = createPrismaProjectRepository()

  const taskManagement = createTaskManagementModule({
    notifications,
    events: createTaskProgressEvents({
      awards: gamification,
      projectPoints: {
        incrementProjectPoints: (projectId, delta) => projectsRepository.incrementPoints(projectId, delta),
      },
    }),
    // Feed "Atividade recente": grava/le `history` (entityType "task"). Sem migration — a
    // tabela ja existe como auditoria da casa.
    activity: createPrismaTaskActivityPort(),
  })

  // V5-7b (DEC-21): o prêmio da atividade aprovada sai do módulo de projeto por PORTA LOCAL
  // (`ActivityCompletionAwardPort`); quem credita é o gamification, injetado AQUI (RG-04).
  const projectManagement = createProjectManagementModule({
    ports: {
      projects: projectsRepository,
      activityAwards: createGamificationActivityCompletionAward(gamification),
      // V5-8 (DEC-21/64): a notificação de atraso sai por PORTA LOCAL
      // (`ActivityOverdueNotifierPort`); quem publica é o módulo de notificações.
      overdueNotifier: createNotificationsActivityOverdueNotifier(notifications),
    },
  })

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

  // V5-10a/10b (DEC-75/130/170/72): atestados de frequência — módulo próprio. O lembrete do
  // dia 19 entra por porta local (DEC-21), como o atraso: quem publica é o módulo de
  // notificações; o cron declara o ator de sistema (DEC-54).
  const attestation = createAttestationModule({
    ports: {
      reminderNotifier: createNotificationsCertificateReminderNotifier(notifications),
    },
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
    attestation,
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
