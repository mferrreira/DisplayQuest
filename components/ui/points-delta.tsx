"use client"

/**
 * O contador de pontos do cabeçalho: o total que sobe/desce devagar, e o chip que diz quanto.
 *
 * plan-v3 OND4-B (F4) criou isto como o chip do prêmio. plan-v4 V4-2 (DEC-59) moveu a contagem
 * para o **total**: medido no pedido do dono, "o número aumentando gradativamente é o que fica
 * no header, não o número da animação". O chip passou a dizer só o quanto foi, e a percorrer
 * ~10px no eixo Y na direção do que aconteceu.
 *
 * Quatro regras, e cada uma tem uma medição atrás:
 *
 *  - **quem conta é o total** (`PointsCounter`): o número que a pessoa lê é o da pílula. O chip
 *    é a legenda, e legenda não precisa ser lida em câmera lenta.
 *  - **o chip pertence ao contador**: fica ancorado na pílula de pontos (`app-header.tsx`), não
 *    solto no canto da tela. Quem lê o total precisa ver o porquê do total no mesmo olhar.
 *  - **só anima quando o número é da própria pessoa**: a aprovação credita o responsável pela
 *    tarefa (OND4-A), quase nunca quem aprovou. Essa comparação acontece no hook da mutação,
 *    antes de anunciar (`use-tasks.ts`) — aqui chega só o delta da própria pessoa.
 *  - **`prefers-reduced-motion` mostra o valor final**: quem pediu menos movimento recebe o
 *    número, não a contagem. A leitura acontece dentro do efeito (no início da animação), não
 *    durante a renderização.
 *
 * Desktop-only: os dois vivem dentro do contêiner `hidden md:flex` do cabeçalho
 * (`app-header.tsx:146`), então em tela estreita nem o total animado nem o chip existem. O dono
 * pediu o movimento só em desktop porque "isso pode zoar em mobile" — e aqui isso não exige
 * regra nova, exige não sair do contêiner.
 *
 * A contagem usa `setInterval` em 20 passos, não `requestAnimationFrame`: `rAF` não é comandado
 * pelos timers falsos do teste, e a animação precisa ser verificável sem esperar um segundo real
 * de relógio. O mesmo desenho deixaria o chip preso no meio da contagem numa aba de segundo
 * plano, porque `rAF` não dispara lá — o `setInterval` completa os passos e o valor final aparece
 * de qualquer jeito.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import {
  POINTS_DELTA_LIFETIME_MS,
  POINTS_DELTA_STEP_MS,
  POINTS_DELTA_STEPS,
  clearPointsDelta,
  currentPointsDelta,
  isLivePointsDelta,
  pointsDeltaLabel,
  pointsDeltaMotionClasses,
  pointsTotalAt,
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
 * O contador do cabeçalho (V4-2, DEC-59).
 *
 * Anima de `from` até `to` quando o total que ele renderiza **muda**, e não quando um sinal
 * chega. Essa escolha é o que torna o desenho robusto à ordem real medida em `use-tasks.ts`:
 * `onSuccess` anuncia o sinal (linha 139) e só depois chama `refreshPoints()` (linha 142), que é
 * assíncrono — se a contagem dependesse do sinal, ela começaria com o total ainda velho e
 * contaria até o valor errado, para depois recomeçar quando a sessão chegasse.
 *
 * `useState(points)` no primeiro render é o que mantém o HTML do servidor e o do cliente
 * iguais: servidor e primeira hidratação mostram o total, e a contagem só existe depois de um
 * passo de tempo no cliente.
 */
export function PointsCounter({ points }: { points: number }) {
  const [shown, setShown] = useState(points)
  /** O total que este componente já entregou como definitivo. Começa no primeiro valor visto. */
  const settled = useRef(points)

  useEffect(() => {
    const from = settled.current
    if (from === points) return undefined
    settled.current = points

    if (prefersReducedMotion()) {
      setShown(points)
      return undefined
    }

    // O passo vive no closure do efeito, não dentro do `setShown`: um updater com efeito
    // colateral é impuro, e o React o invoca duas vezes em modo estrito.
    let step = 0
    const timer = setInterval(() => {
      step += 1
      setShown(pointsTotalAt(from, points, step))
      if (step >= POINTS_DELTA_STEPS) clearInterval(timer)
    }, POINTS_DELTA_STEP_MS)

    return () => clearInterval(timer)
  }, [points])

  return (
    <span data-testid="points-total" aria-live="polite">
      {shown}
    </span>
  )
}

/**
 * O chip. Só existe enquanto há sinal: o `key` é o id do sinal, então o mesmo valor anunciado
 * duas vezes produz dois chips, e o movimento em Y acontece nas duas vezes.
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
  // (ver `isLivePointsDelta`), então quem loga depois não pode ver o prêmio de quem saiu.
  if (!isLivePointsDelta(signal, Date.now())) return null
  return <PointsDeltaChip key={signal.id} signal={signal} />
}

function PointsDeltaChip({ signal }: { signal: PointsDeltaSignal }) {
  // O tempo de vida é do chip: ao fim do prazo o sinal sai da loja, e um sinal mais novo nunca
  // é apagado por este timeout (é o caso de duas tarefas concluídas em sequência rápida).
  useEffect(() => {
    const timer = setTimeout(() => clearPointsDelta(signal.id), POINTS_DELTA_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [signal])

  const negative = signal.value < 0

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="points-delta"
      className={cn(
        // Abaixo da pílula, e não acima: medido no cabeçalho, o alto da pílula fica a ~15px do
        // topo da página (`h-16`, conteúdo centralizado) — acima dela o chip sairia pela borda.
        // O movimento em Y entra no MESMO elemento: medido no CSS compilado da instância,
        // `-translate-x-1/2` escreve a propriedade `translate` e o `@keyframes enter` escreve
        // `transform`. Propriedades diferentes compõem — o aviso antigo, do Tailwind v3, de que a
        // animação sobrescreveria o `-translate-x-1/2` não vale nesta base. Ver
        // `pointsDeltaMotionClasses` em `lib/points-delta.ts`.
        "pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold shadow-md animate-in fade-in",
        pointsDeltaMotionClasses(signal.value),
        negative
          ? "bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300",
      )}
    >
      {pointsDeltaLabel(signal.value)}
      {/* O "+15" sozinho é lido como "mais 15" por alguns leitores de tela; o sufixo fecha a frase. */}
      <span className="sr-only"> pontos</span>
    </span>
  )
}
