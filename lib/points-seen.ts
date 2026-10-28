import { isCivilMonth } from "@/backend/domain/time/civil-day"
import { clientStorageKey, readJson, writeJson } from "@/lib/client-storage"

/**
 * O último total de pontos que **aquele usuário** viu naquele navegador (V4-3, DEC-58).
 *
 * Existe porque o sinal do prêmio só nascia de mutação (`features/tasks/hooks/use-tasks.ts:92`)
 * e só quando `awardedTo === pessoa logada`. O caso que o dono relatou e que isto resolve:
 *
 *   voluntário com 0 pts conclui a tarefa → ela vai para revisão → o líder aprova → o prêmio é
 *   creditado ao voluntário, mas na SESSÃO DO LÍDER → o cliente do voluntário nunca vê o número
 *   → ao voltar ou dar refresh, aparecem os 10 sem contagem.
 *
 * A consequência semântica foi aceita explicitamente pelo dono ao decidir a DEC-58: o número
 * animado passa a significar "o que mudou desde a última vez que você viu", e não "o prêmio
 * desta tarefa". Aceitas junto com a decisão: primeira vez não anima (não há baseline); trocar
 * de navegador anima de novo (a baseline é por navegador); ajuste de admin e compra aprovada
 * também animam.
 *
 * Local, não sessão: `sessionStorage` morre ao fechar a aba, e o caso do dono é justamente
 * "quando o usuário entra no sistema de novo".
 */
export function pointsSeenKey(userId: number): string {
  return clientStorageKey("points-seen", userId)
}

/**
 * O total guardado, ou `null` quando não há baseline.
 *
 * `userId` inválido devolve `null` de propósito: `clientStorageKey` descarta `null`/`undefined`
 * dos segmentos, então `clientStorageKey("points-seen", null)` produziria `dq:points-seen` — uma
 * chave única compartilhada por todos os usuários, que faria uma pessoa animar a mudança de
 * outra. A guarda é aqui, e não na montagem da chave, porque o chamador é o cabeçalho e o id
 * vem da sessão, que pode estar a meio do carregamento.
 *
 * Valor que não é número finito também devolve `null`: um storage corrompido não pode virar
 * ponto de partida de uma contagem — é melhor não animar do que animar a partir de lixo.
 */
export function readLastSeenPoints(userId: number | null | undefined): number | null {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null
  const stored = readJson<number | null>(pointsSeenKey(userId), null)
  return typeof stored === "number" && Number.isFinite(stored) ? stored : null
}

/** Guarda o total que acabou de ser mostrado. Devolve `false` quando não havia onde guardar. */
export function writeLastSeenPoints(userId: number | null | undefined, points: number): boolean {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return false
  if (!Number.isFinite(points)) return false
  return writeJson(pointsSeenKey(userId), points)
}

/**
 * A baseline do PLACAR DO MÊS (plan-v9 S06, ADR-007/DEC-229, R13, CA10).
 *
 * É chave separada da do saldo de propósito: a pílula do cabeçalho troca de número — passa a
 * contar o placar do mês — e uma baseline antiga de saldo (`dq:points-seen:<id>`, número puro)
 * faria a primeira leitura depois do deploy animar a distância entre saldo e placar, que não é
 * mudança nenhuma. A chave do saldo continua onde está e os testes do V4-3 (DEC-58) seguem válidos.
 *
 * O mês viaja junto com o valor porque a pergunta que a virada impõe ao cabeçalho não é "mudou?",
 * é "mudou PORQUE O MÊS VIROU?". Sem o mês, o reset do fechamento (S02) seria lido como perda e
 * contado em câmera lenta — o R13 diz que não é. Com o mês, a re-tarificação é direta e o chip não
 * anuncia o reset.
 *
 * O mês é a forma `AAAA-MM` validada com `isCivilMonth` do domínio, e não uma regex local: duas
 * validações da mesma forma é o modo de falha congelado da DEC-95/96.
 */
export interface MonthPointsSeen {
  month: string
  points: number
}

export function monthPointsSeenKey(userId: number): string {
  return clientStorageKey("month-points-seen", userId)
}

/** A baseline guardada, ou `null` quando não há baseline, o mês não é mês, ou o valor é lixo. */
export function readLastSeenMonthPoints(
  userId: number | null | undefined,
): MonthPointsSeen | null {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null
  const stored = readJson<unknown>(monthPointsSeenKey(userId), null)
  if (typeof stored !== "object" || stored === null) return null
  const { month, points } = stored as Record<string, unknown>
  if (!isCivilMonth(month)) return null
  if (typeof points !== "number" || !Number.isFinite(points)) return null
  return { month, points }
}

/**
 * Guarda o placar e o mês em que ele foi mostrado. `false` quando não gravou — inclusive quando
 * o mês não tem a forma `AAAA-MM`: uma baseline sem mês não pode decidir virada na leitura
 * seguinte, então é melhor não gravar nada do que gravar uma baseline muda.
 */
export function writeLastSeenMonthPoints(
  userId: number | null | undefined,
  month: string,
  points: number,
): boolean {
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return false
  if (!isCivilMonth(month)) return false
  if (!Number.isFinite(points)) return false
  return writeJson(monthPointsSeenKey(userId), { month, points })
}
