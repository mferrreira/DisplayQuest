/**
 * plan-v3 OND4-B — o prêmio creditado viaja da mutação até o contador do cabeçalho.
 *
 * O número em si já existia (OND4-A, DEC-48): a resposta de concluir/aprovar carrega
 * `awardedTo` e `awardedPoints`, e o contador do cabeçalho já atualizava — só pulava do total
 * antigo para o novo, sem dizer quanto nem para que lado. Este módulo é a ponte entre a
 * mutação que recebeu o número e o chip que mostra o sinal.
 *
 * Por que estado de módulo e não contexto: quem anuncia é um hook de mutação
 * (`features/tasks/hooks/use-tasks.ts`) e quem consome é o cabeçalho
 * (`components/layout/app-header.tsx`). Os dois estão em galhos diferentes da árvore — um
 * provider exigiria que o cabeçalho e o quadro compartilhassem um ancestral que hoje não
 * existe, e o cabeçalho também é usado em telas que não montam o quadro.
 *
 * A regra de **quem** ganhou não mora aqui: ela é da mutação
 * (`features/tasks/hooks/use-tasks.ts`), que compara `awardedTo` com a pessoa logada antes de
 * chamar `announcePointsDelta`. É a consequência direta da medição do 4.A — a aprovação credita
 * o responsável pela tarefa, quase nunca quem aprovou, então animar o contador de quem aprovou
 * mostraria o prêmio de outra pessoa. Aqui só entra o que já é delta de alguém.
 *
 * Estado no módulo (e não em `useState`) porque o sinal precisa sobreviver à troca de quem
 * renderiza: a mutação acontece num componente do quadro e o chip vive no cabeçalho. O
 * servidor nunca anuncia — só o clique gera o sinal — então este estado não atravessa requisição.
 *
 * O módulo não importa nada: serve para `components/`, `features/` e `lib/` sem cruzar regra
 * do gate (mesma premissa de `lib/client-storage.ts`, OND2-A).
 */

// ---------------------------------------------------------------------------
// A contagem (puro — o componente só orquestra o tempo)
// ---------------------------------------------------------------------------

/** Passos da contagem: 20 passos de 50 ms = 1 s, o tempo que o PLAN.md pede. */
export const POINTS_DELTA_STEPS = 20
export const POINTS_DELTA_STEP_MS = 50
/** Quanto o valor final fica na tela depois da contagem, antes do chip sumir. */
export const POINTS_DELTA_LINGER_MS = 900
/** Tempo de vida do sinal: a contagem inteira, mais a pausa com o valor final. */
export const POINTS_DELTA_LIFETIME_MS =
  POINTS_DELTA_STEPS * POINTS_DELTA_STEP_MS + POINTS_DELTA_LINGER_MS

/**
 * Valor mostrado no passo `step` (0 = ainda não começou).
 *
 * Arredondado porque o número na tela é inteiro: sem isso apareceria `+7.5 pontos`, um valor
 * que o servidor nunca creditou. O arredondamento é **simétrico** (magnitude primeiro, sinal no
 * fim) para que o round do JavaScript, que arredonda `-0.5` para `-0`, não produza um `-0` no
 * meio da contagem de um prêmio negativo.
 */
export function pointsDeltaValueAt(delta: number, step: number): number {
  if (step <= 0) return 0
  if (step >= POINTS_DELTA_STEPS) return delta
  const magnitude = (Math.abs(delta) * step) / POINTS_DELTA_STEPS
  // Nunca "+0" no meio da contagem: um chip que pisca zero mente sobre um prêmio que existe.
  // O menor passo visível é 1 na direção do delta — para |delta| = 1 esse é o próprio valor
  // final, então a contagem não inventa número nenhum.
  const visible = Math.max(1, Math.round(magnitude))
  return delta < 0 ? -visible : visible
}

/** O texto do chip: `+15` / `−10`. O sinal de menos é o tipográfico (U+2212), não o hífen. */
export function pointsDeltaLabel(delta: number): string {
  return delta < 0 ? `−${Math.abs(delta)}` : `+${delta}`
}

/** Um sinal de prêmio. `id` cresce a cada anúncio — dois prêmios iguais são dois sinais. */
export interface PointsDeltaSignal {
  /** Identificador do sinal; o chip anima por ele, então repetir o valor anima de novo. */
  id: number
  /** Valor creditado pelo servidor, para a pessoa logada. Já vem assinado. */
  value: number
  /** Quando o prêmio foi anunciado. Serve para saber se o sinal ainda é atual. */
  at: number
}

/**
 * O sinal ainda serve? Passou da vida útil, ele não é.
 *
 * Medido: o chip se desmonta junto com o cabeçalho (logout, tela que não tem cabeçalho), e o
 * `setTimeout` que limparia o sinal é cancelado junto com ele — sem esta marcação no tempo, o
 * prêmio de uma sessão apareceria para quem logasse depois, sem contagem e sem contexto. A
 * alternativa (limpar no `cleanup`) foi descartada porque o modo estrito do React monta,
 * desmonta e remonta todo efeito: em desenvolvimento o chip nunca apareceria.
 */
export function isLivePointsDelta(signal: PointsDeltaSignal, now: number): boolean {
  return now - signal.at <= POINTS_DELTA_LIFETIME_MS
}

let current: PointsDeltaSignal | null = null
let sequence = 0
const listeners = new Set<() => void>()

/**
 * Anuncia o delta. Ignora o que não é delta: `null` (ninguém creditado / creditador não rodou)
 * e `0` (o award já existia — DEC-48). Devolve se houve sinal, que o teste usa para provar a
 * regra sem precisar desenhar o chip.
 */
export function announcePointsDelta(value: number | null | undefined, now?: number): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return false
  sequence += 1
  current = { id: sequence, value, at: now ?? Date.now() }
  for (const listener of [...listeners]) listener()
  return true
}

/** O sinal vigente, ou `null` quando nada foi anunciado (também é o `getSnapshot` do React). */
export function currentPointsDelta(): PointsDeltaSignal | null {
  return current
}

/**
 * Limpa **o sinal que expirou** — um sinal mais novo nunca é apagado pelo timeout do anterior,
 * que é o que acontece quando duas tarefas são concluídas em sequência rápida.
 */
export function clearPointsDelta(id: number): void {
  if (!current || current.id !== id) return
  current = null
  for (const listener of [...listeners]) listener()
}

/** Assina os avisos. Devolve a função de cancelamento (o `subscribe` do `useSyncExternalStore`). */
export function subscribeToPointsDelta(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Só para teste: devolve o estado do módulo ao neutro, inclusive a sequência. */
export function resetPointsDeltaStore(): void {
  current = null
  sequence = 0
  listeners.clear()
}