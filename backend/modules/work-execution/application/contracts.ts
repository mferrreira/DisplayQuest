import type { ActorRef, DailyLog, WorkSession } from "@/backend/domain"

/**
 * B6-5 (D4): os comandos de sessão trocam o par `actorUserId`/`actorRoles` (roles CRUS, a
 * "mesma dívida com outra grafia" do DEC-50) por `ActorRef`. Quem decide é o use case com
 * `requireActorSelfOrPermission` / `canActorManageWorkSessions` — a rota só entrega o ator.
 */
export interface StartWorkSessionCommand {
  actor: ActorRef
  userId: number
  /** Nome PEDIDO no corpo. Só vale para quem tem MANAGE_WORK_SESSIONS (escopo medido na rota). */
  userName?: string
  /** Nome da SESSÃO do ator — usado quando o escopo é self (não-gestor nunca escreve outro nome). */
  actorName?: string
  activity?: string
  location?: string
  projectId?: number
  startTime?: string
}

export interface CompleteWorkSessionCommand {
  sessionId: number
  actor: ActorRef
  activity?: string
  location?: string
  endTime?: string
  projectId?: number | null
  completedTaskIds?: number[]
  dailyLogNote?: string
  dailyLogDate?: string
}

export interface CreateDailyLogFromSessionCommand {
  sessionId: number
  actorUserId: number
  note?: string
  date?: string
}

/**
 * B6-5: a query de lista carrega o ator e a resolução de ESCOPO (antes na rota) passou para
 * dentro do `ListWorkSessionsUseCase`:
 *  - system (cron, NIGHTLY_SWEEP) → varredura crua;
 *  - MANAGE_WORK_SESSIONS → `activeOnly` vence `userId`, que vence `status` (ordem medida);
 *  - sem gestão → só as próprias, filtro de status IGNORADO (quirk congelado), e `userId` de
 *    outro é 403 "Acesso negado";
 *  - `projectId` sem gestão → caminho do líder (403 "Acesso negado" quando o ator não lidera).
 */
export interface ListWorkSessionsQuery {
  actor: ActorRef
  userId?: number
  status?: string
  projectId?: number
  activeOnly?: boolean
}

/** B6-5: mesma resolução de escopo do GET /api/daily_logs (composta MANAGE_USERS || LABORATORISTA, DEC-117). */
export interface ListDailyLogsQuery {
  actor: ActorRef
  userId?: number
  projectId?: number
  date?: string
}

/**
 * B6-5: escopo do líder decide DENTRO do use case. Escopo vazio e `projectId` fora do escopo
 * agora são ForbiddenError com a mensagem da ROTA chamadora (parâmetro `deniedMessage`):
 * "Acesso negado" no GET /api/work-sessions, "Acesso negado." (com ponto) no GET /api/daily_logs
 * — os dois textos foram medidos nas rotas legado. O early-return vazio que existia era a
 * decisão de 403 da rota vazada no contrato do use case (nenhum outro chamador).
 */
export interface ListProjectLogsForLeaderCommand {
  actor: ActorRef
  projectId?: number
  memberUserId?: number
  deniedMessage?: string
}

export interface ProjectLogsForLeaderResult {
  logs: DailyLog[]
  sessions: WorkSession[]
  ledProjectIds: number[]
}

export interface DeleteWorkSessionCommand {
  sessionId: number
  actor: ActorRef
}

export interface UpdateWorkSessionCommand {
  sessionId: number
  actor: ActorRef
  activity?: string
  location?: string
  // B10 · D9 (DEC-125): o comando continua com o valor CRU da borda (molde B6-7 — o gate
  // decide sobre o corpo cru); o use case reconcilia com toWorkSessionStatus antes de
  // escrever. O quirk golden "unknown status assigned verbatim" e superado pela forca
  // normativa do vocabulario: status fora de {active, paused, completed} agora e
  // ValidationError (400), nao uma escrita na coluna String.
  status?: string
  endTime?: string
  startTime?: string
  duration?: number
  projectId?: number | null
  completedTaskIds?: number[]
}

export interface WorkExecutionResult {
  session: WorkSession
  dailyLog?: DailyLog
}
