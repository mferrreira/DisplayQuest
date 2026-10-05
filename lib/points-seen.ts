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
