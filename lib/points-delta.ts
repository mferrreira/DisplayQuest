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
/** Valor fixo de passos e cadência da contagem — compartilhados pelo chip e pelo cabeçalho. */
export const POINTS_DELTA_STEPS = 20
export const POINTS_DELTA_STEP_MS = 50
/** Quanto o valor final fica na tela depois da contagem, antes do chip sumir. */
export const POINTS_DELTA_LINGER_MS = 900
/**
 * Tempo de vida do sinal: a contagem do cabeçalho inteira, mais a pausa com o valor final.
 *
 * V4-2 (DEC-59) mudou **quem** conta — o cabeçalho, não o chip — mas não mudou a duração. O
 * chip continua vivendo o tempo inteiro da contagem para não sumir antes de o total terminar de
 * subir: sinal que morre no meio deixaria o cabeçalho contando sem explicação ao lado.
 */
export const POINTS_DELTA_LIFETIME_MS =
  POINTS_DELTA_STEPS * POINTS_DELTA_STEP_MS + POINTS_DELTA_LINGER_MS

/**
 * Total mostrado no passo `step` de uma contagem que vai de `from` até `to` (V4-2, DEC-59).
 *
 * É a matemática que estava em `pointsDeltaValueAt`, aplicada ao **total** em vez do delta — o
 * chip parou de contar (DEC-59: quem conta é o cabeçalho), e a contagem foi para lá. Duas
 * diferenças deliberadas em relação à versão antiga:
 *
 *  - **não existe o `Math.max(1, …)`.** O chip não podia mostrar `+0` porque isso mentiria sobre
 *    um prêmio que existe; o cabeçalho mostrando o total antigo nos primeiros passos não mente
 *    nada — o total antigo *era* o valor. Com `delta = 1` isso significa segurar o valor antigo
 *    e dar o salto no meio da contagem, que é o comportamento honesto para um passo indivisível.
 *  - **o arredondamento simétrico continua** (magnitude primeiro, sinal no fim) pela mesma razão
 *    medida antes: `Math.round(-0.5)` é `-0` no JavaScript, e `from + -0` é inofensivo aqui, mas
 *    a magnitude primeiro mantém a função legível nos dois sentidos.
 */
export function pointsTotalAt(from: number, to: number, step: number): number {
  if (step <= 0) return from
  if (step >= POINTS_DELTA_STEPS) return to
  const delta = to - from
  if (delta === 0) return to
  const magnitude = (Math.abs(delta) * step) / POINTS_DELTA_STEPS
  const visible = Math.round(magnitude)
  return from + (delta < 0 ? -visible : visible)
}

/**
 * Quanto o chip percorre no eixo Y, em pixels (V4-2, DEC-59).
 *
 * O dono pediu "algo como 10 pixels". É um número nomeado e não um literal no JSX porque o
 * mesmo valor precisa aparecer na classe utilitária (`slide-in-from-bottom-[10px]`) e num teste
 * que afirma a direção do movimento sem medir pixel — pixel é do navegador, direção é do código.
 */
export const POINTS_DELTA_SHIFT_PX = 10

/**
 * Classes que dão o movimento em Y do chip: **para cima** quando o número sobe, **para baixo**
 * quando desce.
 *
 * Medido em 2026-10-05 no CSS compilado da instância em execução (`/_next/static/css/app/layout.css`
 * do dev server em 3001), e isso **refuta o comentário que estava aqui antes**:
 *
 *   `.-translate-x-1\/2 { --tw-translate-x: …; translate: var(--tw-translate-x) var(--tw-translate-y); }`
 *   `@keyframes enter { from { transform: translate3d(var(--tw-enter-translate-x,0),var(--tw-enter-translate-y,0),0) … } }`
 *
 * Centralizar usa a propriedade `translate`; a animação usa `transform`. Propriedades diferentes
 * compõem em vez de sobrescrever. O aviso anterior ("as variantes com transform sobrescrevem o
 * `-translate-x-1/2`") era verdade no Tailwind v3 com `tailwindcss-animate`; nesta base
 * (Tailwind v4 + `tw-animate-css`) não é mais. Por isso o movimento entra no mesmo elemento, sem
 * span extra.
 *
 * O valor vai entre colchetes porque `slide-in-from-bottom-*` aceita comprimento arbitrário
 * (`--value(--translate-*,[percentage],[length])` no `@utility` do plugin), e `2.5` não é
 * reconhecido — o ramo de escala só aceita inteiro.
 */
export function pointsDeltaMotionClasses(value: number): string {
  return value < 0
    ? `slide-in-from-top-[${POINTS_DELTA_SHIFT_PX}px]`
    : `slide-in-from-bottom-[${POINTS_DELTA_SHIFT_PX}px]`
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