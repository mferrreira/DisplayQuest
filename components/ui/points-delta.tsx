"use client"

/**
 * plan-v3 OND4-B (F4) — o chip que mostra o prêmio creditado no contador do cabeçalho.
 *
 * Medido antes de desenhar (2026-10-03): o contador do cabeçalho já recebia o total novo
 * (`useSession().update()` em `useTaskMutations`, com a sessão re-lendo `users.points` do banco),
 * mas **pulava** do valor antigo para o novo. Quem entregava no prazo via 10 pontos e não via
 * menos 20 recebia a mesma coisa de quem não ganhou nada — e a entrega atrasada, que tira
 * pontos (DEC-39, sem piso), parecia um ganho. O número já existia no contrato (OND4-A); aqui ele
 * vira sinal.
 *
 * Três regras, e cada uma tem uma medição atrás:
 *
 *  - **o chip pertence ao contador**: fica ancorado na pílula de pontos (`app-header.tsx`), não
 *    solto no canto da tela. Quem lê o total precisa ver o porquê do total no mesmo olhar.
 *  - **só anima quando quem ganhou foi a pessoa logada**: a aprovação credita o responsável
 *    pela tarefa (OND4-A), quase nunca quem aprovou. Essa comparação acontece no hook da
 *    mutação, antes de anunciar (`use-tasks.ts`) — aqui chega só o delta da própria pessoa.
 *  - **`prefers-reduced-motion` mostra o valor final**: quem pediu menos movimento recebe o
 *    número, não a contagem. A leitura acontece dentro do efeito (no início da animação), não
 *    durante a renderização.
 *
 * A contagem usa `setInterval` em 20 passos, não `requestAnimationFrame`: `rAF` não é comandado
 * pelos timers falsos do teste, e a animação precisa ser verificável sem esperar um segundo
 * real de relógio. O mesmo desenho deixaria o chip preso no meio da contagem numa aba de
 * segundo plano, porque `rAF` não dispara lá — o `setInterval` completa os passos e o valor
 * final aparece de qualquer jeito.
 */
import { useEffect, useState, useSyncExternalStore } from "react"

import {
  POINTS_DELTA_LIFETIME_MS,
  POINTS_DELTA_STEP_MS,
  POINTS_DELTA_STEPS,
  clearPointsDelta,
  currentPointsDelta,
  isLivePointsDelta,
  pointsDeltaLabel,
  pointsDeltaValueAt,
  subscribeToPointsDelta,
  type PointsDeltaSignal,
} from "@/lib/points-delta"
import { cn } from "@/lib/utils/utils"

/** O navegador pede menos movimento? Sem `matchMedia` (navegador antigo, SSR) assume que sim. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * O chip. Só existe enquanto há sinal: o `key` é o id do sinal, então o mesmo valor anunciado
 * duas vezes anima duas vezes (e o `useState` interno do contador reinicia).
 */
export function PointsDelta() {
  const signal = useSyncExternalStore(
    subscribeToPointsDelta,
    currentPointsDelta,
    // Servidor: nenhum sinal é anunciado durante a renderização, então o primeiro desenho é vazio.
    () => null,
  )

  if (!signal) return null
  // Sinal velho não ressuscita: o chip se desmontou com o cabeçalho e o prazo do sinal passou
  // (ver `isLivePointsDelta`), então quem loga depois não vê o prêmio de quem saiu.
  if (!isLivePointsDelta(signal, Date.now())) return null
  return <PointsDeltaChip key={signal.id} signal={signal} />
}

function PointsDeltaChip({ signal }: { signal: PointsDeltaSignal }) {
  // `steps`, e não o valor, porque o valor 0 é o "ainda não começou": mostrar "+0" por 50 ms
  // seria mentir sobre um prêmio que existe.
  const [steps, setSteps] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setSteps(POINTS_DELTA_STEPS)
      return undefined
    }

    // O passo vive no closure do efeito, não dentro do `setSteps`: um updater com efeito
    // colateral é impuro, e o React o invoca duas vezes em modo estrito.
    let step = 0
    const timer = setInterval(() => {
      step += 1
      setSteps(step)
      if (step >= POINTS_DELTA_STEPS) clearInterval(timer)
    }, POINTS_DELTA_STEP_MS)

    return () => clearInterval(timer)
  }, [signal])

  // O tempo de vida é do chip: ao fim do prazo o sinal sai da loja, e um sinal mais novo nunca
  // é apagado por este timeout (é o caso de duas tarefas concluídas em sequência rápida).
  useEffect(() => {
    const timer = setTimeout(() => clearPointsDelta(signal.id), POINTS_DELTA_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [signal])

  if (steps === 0) return null

  const shown = pointsDeltaValueAt(signal.value, steps)
  const negative = signal.value < 0

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="points-delta"
      className={cn(
        // Abaixo da pílula, e não acima: medido no cabeçalho, o alto da pílula fica a ~15px do
        // topo da página (`h-16`, conteúdo centralizado) — acima dela o chip sairia pela borda.
        // Só `fade-in`: as variantes com transform (`zoom-in-95`, `slide-in-from-*`) sobrescrevem
        // o `-translate-x-1/2` e desalinhariam o chip durante a animação.
        "pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold shadow-md animate-in fade-in",
        negative
          ? "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300",
      )}
    >
      {pointsDeltaLabel(shown)}
      {/* O "+15" sozinho é lido como "mais 15" por alguns leitores de tela; o sufixo fecha a frase. */}
      <span className="sr-only"> pontos</span>
    </span>
  )
}