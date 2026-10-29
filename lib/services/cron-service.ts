import * as cron from 'node-cron'
import { getBackendComposition } from '@/backend/composition/root'
import { SCHEDULED_PAUSE_TIMES } from '@/backend/domain/work'
import { SYSTEM_REASONS, systemActor } from '@/backend/domain/identity'
import { startOfCivilDayInstant } from '@/backend/domain'

/**
 * repo-cleanup B3 (D2): as expressões cron de pausa são DERIVADAS de
 * SCHEDULED_PAUSE_TIMES (backend/domain/work/schedule.ts) agrupando por minuto —
 * antes havia cópia manual ('30 9,15 * * *' / '0 12,17 * * *') que divergia do domínio
 * em silêncio: '30 9,15' disparava 15:30, horário que NÃO está em SCHEDULED_PAUSE_TIMES.
 * Para ["09:30","12:00","15:00","17:00"] produz "30 9 * * *" + "0 12,15,17 * * *"
 * (pinned por tests/unit/services/cron-schedule.test.ts).
 */
function pauseCronExpressions(times: readonly string[]): string[] {
  const byMinute = new Map<number, number[]>()
  for (const t of times) {
    const [h, m] = t.split(':').map(Number)
    const hours = byMinute.get(m) ?? []
    hours.push(h)
    byMinute.set(m, hours)
  }
  return [...byMinute.entries()].map(([m, hs]) => `${m} ${hs.sort((a, b) => a - b).join(',')} * * *`)
}

export class CronService {
  private weeklyResetJob: cron.ScheduledTask | null = null
  /** plan-v9 S02 (DEC-224): fechamento do mes do Quadro de Lideranca, dia 1 as 00:00. */
  private monthlyCloseJob: cron.ScheduledTask | null = null
  private scheduledPauseJobs: cron.ScheduledTask[] = []
  private isInitialized = false

  /**
   * Inicializa o serviço de cron
   */
  init() {
    if (this.isInitialized) {
      return
    }

    // Reset semanal - toda segunda-feira às 00:00
    this.weeklyResetJob = cron.schedule('0 0 * * 1', async () => {
      await this.executeWeeklyReset()
    }, {
      timezone: 'America/Sao_Paulo' // Fuso horário do Brasil
    })

    // plan-v9 S02 (R5, DEC-224): fechamento do mes do Quadro de Lideranca — dia 1 as 00:00,
    // depois do sweep noturno das 23:59 do ultimo dia, para nenhum premio creditado na virada
    // ficar de fora do mes que fecha.
    this.monthlyCloseJob = cron.schedule('0 0 1 * *', async () => {
      await this.executeMonthlyBoardClose()
    }, {
      timezone: 'America/Sao_Paulo'
    })

    // Pause automático das work sessions: horários vindos de SCHEDULED_PAUSE_TIMES (D2)
    this.scheduledPauseJobs = pauseCronExpressions(SCHEDULED_PAUSE_TIMES).map((expression) =>
      cron.schedule(expression, async () => {
        await this.executeScheduledPause()
      }, { timezone: 'America/Sao_Paulo' })
    )

    this.nightlySweepJob = cron.schedule('59 23 * * *', async () => {
      await this.executeNightlySweep()
    }, { timezone: 'America/Sao_Paulo' })

    // V5-8 (DEC-64): varredura diária de atraso — 08:00, para o gestor encontrar o aviso
    // com o dia de trabalho começando. Uma notificação por atividade (guarda
    // `overdueNotifiedAt`), líder + coordenadores/gerentes, com destaque no painel.
    this.overdueScanJob = cron.schedule('0 8 * * *', async () => {
      await this.executeOverdueScan()
    }, { timezone: 'America/Sao_Paulo' })

    // V5-10b (DEC-72): lembrete mensal de atestados — dia 19 às 09:00. O mês atestável é
    // o anterior (DEC-171), e o aviso chega um dia depois da virada do mês, com a semana
    // de trabalho começando. Audiência: líderes de projeto + coordenadores/gerentes ativos.
    this.certificateReminderJob = cron.schedule('0 9 19 * *', async () => {
      await this.executeCertificateReminder()
    }, { timezone: 'America/Sao_Paulo' })

    // V6-11k (pedido do dono): limpeza diária do feed "Atividade recente" — 00:07, depois da
    // virada do dia e do sweep das 23:59. O feed é log simples: só o dia corrente sobrevive.
    // ESCOPO: `entityType "task"` apenas — a tabela `history` compartilha as premiações
    // (idempotência LÊ essas linhas) e os avisos do laboratório, que jamais são apagados.
    this.activityCleanupJob = cron.schedule('7 0 * * *', async () => {
      await this.executeTaskActivityCleanup()
    }, { timezone: 'America/Sao_Paulo' })

    this.isInitialized = true
  }

  private nightlySweepJob: cron.ScheduledTask | null = null
  private overdueScanJob: cron.ScheduledTask | null = null
  private certificateReminderJob: cron.ScheduledTask | null = null
  private activityCleanupJob: cron.ScheduledTask | null = null

  /**
   * Pausa todas as sessões ativas que cruzaram um horário de pausa agendado.
   * Também persiste o auto-pause em work_sessions via normalização (lazy
   * persist: listar já grava paused no DB, cobrindo farm overnight/weekend).
   */
  async executeScheduledPause() {
    try {
      const { workExecution, labOperations } = getBackendComposition()
      // Persist work_sessions auto-pause (list normalizes active→paused).
      // B6-5 (D4): rotina sem pessoa — systemActor(SCHEDULED_PAUSE), o bypass declarado
      // (DEC-54). A label e de auditoria: este job e a pausa agendada, nao o sweep 23:59.
      await workExecution.listWorkSessions({ actor: systemActor(SYSTEM_REASONS.SCHEDULED_PAUSE), status: 'active' })
      const sessions = await workExecution.listWorkSessions({ actor: systemActor(SYSTEM_REASONS.SCHEDULED_PAUSE), status: 'active' })
      const affectedUserIds = [
        ...new Set((sessions ?? []).map((s: any) => s.userId as number).filter((uid: number) => Number.isInteger(uid) && uid > 0)),
      ]
      for (const userId of affectedUserIds) {
        try {
          await labOperations.pauseResponsibilityForUser({ actor: systemActor(SYSTEM_REASONS.SCHEDULED_PAUSE), userId })
        } catch (err) {
          console.error(`⚠️ Não foi possível pausar responsabilidade do usuário ${userId}:`, err)
        }
      }
    } catch (error) {
      console.error('❌ Erro ao executar pause automático de sessões:', error)
    }
  }

  /** Sweep 23:59 America/Sao_Paulo — qualquer ativa restante vira pausada (anti-farm). */
  async executeNightlySweep() {
    try {
      const { workExecution } = getBackendComposition()
      // B6-5 (D4): varredura anti-farm sem pessoa — systemActor(NIGHTLY_SWEEP) (DEC-54).
      await workExecution.listWorkSessions({ actor: systemActor(SYSTEM_REASONS.NIGHTLY_SWEEP), status: 'active' })
    } catch (error) {
      console.error('❌ Erro no sweep noturno de sessões:', error)
    }
  }

  /**
   * Executa o reset semanal de horas.
   *
   * repo-cleanup B3 (D1): a lógica migrou do Prisma cru (findMany users/sessions,
   * history.create, users.update por usuário) para o ResetWeeklyHoursHistoryUseCase do
   * módulo reporting via composition root — mesma semântica (window startOfWeek/
   * endOfWeek { weekStartsOn: 1 }, history só com totalHours > 0, currentWeekHours
   * zerado para todo ativo, sem dedup — pinada por tests/unit/services/
   * cron-weekly-reset.golden.test.ts e pelo contract/roundtrip do reporting (QUIRK-7C).
   */
  private async executeWeeklyReset() {
    try {
      const { reporting } = getBackendComposition()
      // B6-3 (D4, DEC-54): o reset passou a exigir ator. O cron e rotina de sistema sem
      // pessoa atras — systemActor("WEEKLY_RESET"), o bypass declarado. Sem isso, o gate de
      // MANAGE_USERS que desceu para o use case derrubava o reset noturno em producao, e
      // nenhum teste de rota exercitaria a quebra.
      await reporting.resetWeeklyHoursHistory(systemActor(SYSTEM_REASONS.WEEKLY_RESET))
    } catch (error) {
      console.error('❌ Erro ao executar reset automático:', error)
    }
  }

  /**
   * Fechamento do mês do Quadro de Liderança (plan-v9 S02, DEC-224, DEC-225): dia 1 às 00:00,
   * fechando o mês civil anterior. Rotina sem pessoa — `systemActor(MONTH_CLOSE)`, o bypass
   * declarado (DEC-54): o `CloseBoardMonthUseCase` checa o ator, e a mesma rotina continua
   * funcionando quando a gestão dispara o fechamento pela rota.
   *
   * Roda depois do sweep noturno das 23:59 do último dia: prêmio creditado pelo sweep entra no
   * mês que está fechando, não no seguinte (MODELO §12).
   */
  private async executeMonthlyBoardClose() {
    try {
      const { gamification } = getBackendComposition()
      const result = await gamification.closeBoardMonth({
        actor: systemActor(SYSTEM_REASONS.MONTH_CLOSE),
        now: new Date(),
      })
      if (result.closed) {
        console.log(`📅 Fechamento do quadro de ${result.monthLabel}: ${result.peopleCount} linha(s).`)
      } else {
        console.log(`📅 O quadro de ${result.monthLabel} já estava fechado; nada mudou.`)
      }
    } catch (error) {
      console.error('❌ Erro ao fechar o mês do quadro:', error)
    }
  }

  /**
   * Varredura diária de atraso (V5-8, DEC-64): atividade vencida e não aprovada vira
   * UMA notificação prioritária (guarda `overdueNotifiedAt`), para o líder do projeto e
   * os coordenadores/gerentes globais. Rotina sem pessoa — systemActor(OVERDUE_SCAN),
   * o bypass declarado (DEC-54): a publicação desce para o `publishEvent`, que checa o
   * ator, e o único chamador deste use case é este job — não existe rota.
   */
  async executeOverdueScan() {
    try {
      const { projectManagement } = getBackendComposition()
      const result = await projectManagement.notifyOverdueActivities({
        actor: systemActor(SYSTEM_REASONS.OVERDUE_SCAN),
        now: new Date(),
      })
      if (result.notifiedActivities > 0) {
        console.log(
          `🔔 Varredura de atraso: ${result.notifiedActivities} atividade(s) notificada(s), ` +
            `${result.recipientsNotified} destinatário(s).`,
        )
      }
    } catch (error) {
      console.error('❌ Erro ao executar varredura de atraso:', error)
    }
  }

  /**
   * V5-10b (DEC-72): lembrete de atestados no dia 19. Rotina sem pessoa —
   * systemActor(CERTIFICATE_REMINDER), o bypass declarado (DEC-54); não existe rota para
   * ele de propósito.
   */
  async executeCertificateReminder() {
    try {
      const { attestation } = getBackendComposition()
      const result = await attestation.notifyCertificateReminder({
        actor: systemActor(SYSTEM_REASONS.CERTIFICATE_REMINDER),
        now: new Date(),
      })
      if (result.projectsNotified > 0) {
        console.log(
          `📄 Lembrete de atestados: ${result.projectsNotified} projeto(s) notificado(s), ` +
            `${result.recipientsNotified} destinatário(s).`,
        )
      }
    } catch (error) {
      console.error('❌ Erro ao executar lembrete de atestados:', error)
    }
  }

  /**
   * V6-11k (pedido do dono): limpeza diária do feed de atividade de tarefa. O corte é o
   * INÍCIO DO DIA CIVIL de hoje em America/Sao_Paulo (`startOfCivilDayInstant`, a mesma peça
   * que o filtro de leitura da rota usa) — o que sobra é só o dia corrente.
   *
   * Segurança medida (DELETE no banco não admite erro):
   *   - escopo duro por `entityType "task"` na própria instrução (porta documenta);
   *   - UMA instrução `deleteMany`, sem transação e sem laço;
   *   - o número apagado vai para o log com o corte — a limpeza é auditável;
   *   - falha só vira `console.error`; a rotina volta amanhã e nada quebra. Log de limpeza
   *     nunca derruba outro job: o try/catch é por job, como os demais.
   */
  async executeTaskActivityCleanup() {
    try {
      const cutoff = startOfCivilDayInstant(new Date())
      const { taskManagement } = getBackendComposition()
      const removed = await taskManagement.purgeTaskActivity(cutoff)
      console.log(`🧹 Limpeza do feed de atividade: ${removed} registro(s) de tarefa anteriores a ${cutoff.toISOString()}.`)
    } catch (error) {
      console.error('❌ Erro na limpeza do feed de atividade:', error)
    }
  }

  /**
   * Para o serviço de cron
   */
  stop() {
    if (this.weeklyResetJob) {
      this.weeklyResetJob.stop()
    }
    if (this.monthlyCloseJob) {
      this.monthlyCloseJob.stop()
      this.monthlyCloseJob = null
    }
    for (const job of this.scheduledPauseJobs) {
      job.stop()
    }
    if (this.nightlySweepJob) {
      this.nightlySweepJob.stop()
      this.nightlySweepJob = null
    }
    if (this.overdueScanJob) {
      this.overdueScanJob.stop()
      this.overdueScanJob = null
    }
    if (this.certificateReminderJob) {
      this.certificateReminderJob.stop()
      this.certificateReminderJob = null
    }
    if (this.activityCleanupJob) {
      this.activityCleanupJob.stop()
      this.activityCleanupJob = null
    }
    this.scheduledPauseJobs = []
    this.isInitialized = false
  }

  /**
   * Verifica se o serviço está ativo
   */
  isRunning(): boolean {
    return this.isInitialized && this.weeklyResetJob !== null
  }

  /**
   * Executa reset manual (para testes)
   */
  async executeManualReset() {
    await this.executeWeeklyReset()
  }

  /**
   * Obtém informações sobre os jobs agendados
   */
  getStatus() {
    // Calcular próxima execução manualmente (segunda-feira às 00:00)
    const now = new Date()
    const nextMonday = new Date(now)
    const daysUntilMonday = (8 - now.getDay()) % 7 // 0 = domingo, 1 = segunda, etc.
    
    if (daysUntilMonday === 0) {
      // Se hoje é segunda, próxima execução é próxima segunda
      nextMonday.setDate(now.getDate() + 7)
    } else {
      // Se não é segunda, calcular até próxima segunda
      nextMonday.setDate(now.getDate() + daysUntilMonday)
    }
    
    // Definir hora para 00:00
    nextMonday.setHours(0, 0, 0, 0)

    return {
      isInitialized: this.isInitialized,
      weeklyResetRunning: this.weeklyResetJob !== null,
      weeklyResetNextRun: nextMonday.toISOString(),
      weeklyResetSchedule: '0 0 * * 1 (Segunda-feira às 00:00)'
    }
  }
}

// Instância singleton
export const cronService = new CronService() 