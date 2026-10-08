import * as cron from 'node-cron'
import { getBackendComposition } from '@/backend/composition/root'
import { SCHEDULED_PAUSE_TIMES } from '@/backend/domain/work'
import { SYSTEM_REASONS, systemActor } from '@/backend/domain/identity'

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

    // Pause automático das work sessions: horários vindos de SCHEDULED_PAUSE_TIMES (D2)
    this.scheduledPauseJobs = pauseCronExpressions(SCHEDULED_PAUSE_TIMES).map((expression) =>
      cron.schedule(expression, async () => {
        await this.executeScheduledPause()
      }, { timezone: 'America/Sao_Paulo' })
    )

    this.nightlySweepJob = cron.schedule('59 23 * * *', async () => {
      await this.executeNightlySweep()
    }, { timezone: 'America/Sao_Paulo' })

    this.isInitialized = true
  }

  private nightlySweepJob: cron.ScheduledTask | null = null

  /**
   * Pausa todas as sessões ativas que cruzaram um horário de pausa agendado.
   * Também persiste o auto-pause em work_sessions via normalização (lazy
   * persist: listar já grava paused no DB, cobrindo farm overnight/weekend).
   */
  async executeScheduledPause() {
    try {
      const { workExecution, labOperations } = getBackendComposition()
      // Persist work_sessions auto-pause (list normalizes active→paused)
      await workExecution.listWorkSessions({ status: 'active' })
      const sessions = await workExecution.listWorkSessions({ status: 'active' })
      const affectedUserIds = [
        ...new Set((sessions ?? []).map((s: any) => s.userId as number).filter((uid: number) => Number.isInteger(uid) && uid > 0)),
      ]
      for (const userId of affectedUserIds) {
        try {
          await labOperations.pauseResponsibilityForUser(userId)
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
      await workExecution.listWorkSessions({ status: 'active' })
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
   * Para o serviço de cron
   */
  stop() {
    if (this.weeklyResetJob) {
      this.weeklyResetJob.stop()
    }
    for (const job of this.scheduledPauseJobs) {
      job.stop()
    }
    if (this.nightlySweepJob) {
      this.nightlySweepJob.stop()
      this.nightlySweepJob = null
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