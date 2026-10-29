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
  announcePointsDelta,
  clearPointsDelta,
  currentPointsDelta,
  isLivePointsDelta,
  pointsDeltaLabel,
  pointsDeltaMotionClasses,
  pointsTotalAt,
  subscribeToPointsDelta,
  type PointsDeltaSignal,
} from "@/lib/points-delta"
import {
  readLastSeenMonthPoints,
  readLastSeenPoints,
  writeLastSeenMonthPoints,
  writeLastSeenPoints,
} from "@/lib/points-seen"
import { cn } from "@/lib/utils/utils"

/** O navegador pede menos movimento? Sem `matchMedia` (navegador antigo, SSR) assume que sim. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * O contador do cabeçalho (V4-2, DEC-59; catch-up no V4-3, DEC-58; placar do mês no plan-v9 S06).
 *
 * Anima de `from` até `to` quando o total que ele renderiza **muda**, e não quando um sinal
 * chega. Essa escolha é o que torna o desenho robusto à ordem real medida em `use-tasks.ts`:
 * `onSuccess` anuncia o sinal (linha 139) e só depois chama `refreshPoints()` (linha 142), que é
 * assíncrono — se a contagem dependesse do sinal, ela começaria com o total ainda velho e
 * contaria até o valor errado, para depois recomeçar quando a sessão chegasse.
 *
 * V4-3 (DEC-58) acrescenta o caminho que faltava: quando o componente monta e o total é
 * diferente do último que **aquele usuário** viu naquele navegador, ele começa no valor guardado
 * e conta até o atual. É o caso medido que o dono relatou — voluntário conclui, o líder aprova,
 * o prêmio é creditado na sessão do líder, e o cliente do voluntário nunca viu o número.
 *
 * plan-v9 S06 (ADR-007/DEC-229, R13, CA10) acrescenta o `month`. Quando a pílula mostra o
 * **placar do mês**, o fechamento (S02) zera o número — e o zero não é perda: é mês novo. A
 * baseline mensal (`dq:month-points-seen:<id>`, em `lib/points-seen.ts`) guarda o mês junto com o
 * valor, e dois caminhos re-tarificam sem animar e sem chip:
 *  - remontar depois da virada: a baseline lida na montagem é de outro mês, e o valor novo é
 *    mostrado direto;
 *  - a mesma sessão atravessando a virada: o mês chega por re-render, e o efeito decide pela
 *    prop, porque a decisão não pode depender de uma leitura feita na montagem.
 * Sem `month`, o componente é exatamente o de antes (o saldo, DEC-58) — é o que os testes do
 * V4-2/V4-3 continuam congelando.
 *
 * `suppressHydrationWarning` no texto é deliberado: o primeiro valor é específico do navegador
 * (depende do que foi guardado nele), então o HTML do servidor e o do cliente não têm de
 * concordar nesse nó. Sem isso o React acusaria divergência de hidratação por algo que é
 * comportamento, não bug.
 */
export function PointsCounter({
  points,
  userId,
  month,
}: {
  points: number
  /** Quem é a pessoa: a baseline é por usuário, para ninguém animar a mudança de outra. */
  userId?: number | null
  /**
   * O mês civil que o número representa (`AAAA-MM`, nomeado pelo servidor — DEC-132). Presente,
   * a baseline é mensal e a virada re-tarifica; ausente, o comportamento por saldo de sempre.
   */
  month?: string | null
}) {
  const [shown, setShown] = useState(() => startingValue(points, userId, month))
  /**
   * O total que este componente entregou até aqui.
   *
   * É um ref e não o estado, e a razão é o modo estrito do React — que o `next dev` liga e que
   * os testes de jsdom NÃO ligam. Medido no e2e: com o gatilho sendo um ref escrito pelo efeito
   * (`settled = points`), a primeira passada do efeito consumia a diferença, o `clearInterval`
   * do desmonte simulado matava a contagem, e a segunda passada via `from === points` e não
   * animava nada. O contador ficava preso no valor lembrado (-30) para sempre.
   *
   * Lendo de onde o número **está**, e não de onde o efeito decidiu que ele estava, a contagem
   * é idempotente: remontar no meio recomeça do mesmo ponto.
   */
  const displayed = useRef(shown)
  const announcedCatchUp = useRef(false)
  /** O mês deste número, para o efeito distinguir virada de mudança. */
  const seenMonth = useRef<string | null>(month ?? null)

  useEffect(() => {
    const from = displayed.current

    // Virada do mês (S06): mês novo é re-tarificação, e re-tarificação não é contagem. Sem
    // `announcePointsDelta` aqui — o R13 congela que o chip não anuncia o reset como perda.
    if (month && seenMonth.current && seenMonth.current !== month) {
      seenMonth.current = month
      displayed.current = points
      setShown(points)
      writeLastSeenMonthPoints(userId, month, points)
      return undefined
    }

    if (from === points) {
      // Sem mudança: só garante que a baseline existe, para a próxima visita ter de onde partir.
      if (month) writeLastSeenMonthPoints(userId, month, points)
      else writeLastSeenPoints(userId, points)
      return undefined
    }

    // O placar do mês ZERA (CA10): o zero é o estado de partida da trilha, e contá-lo em câmera
    // lenta com um chip `−120` seria anunciar o reset como perda — o que o R13 proíbe. Vale para
    // a virada (mês novo) e para o fechamento manual fora do dia 1 (R6: fecha o mês anterior e
    // zera o placar dentro do MESMO mês civil), caso que a régua de mês sozinha não alcança.
    // Um prêmio que chega por mutação anuncia o próprio sinal antes de chegar aqui
    // (`features/tasks/hooks/use-tasks.ts`), então a penalidade real continua com chip.
    if (month && points === 0) {
      displayed.current = points
      setShown(points)
      writeLastSeenMonthPoints(userId, month, points)
      return undefined
    }

    // O chip do catch-up: a mutação anuncia o próprio sinal (`use-tasks.ts`); uma mudança que
    // chegou por refresh/login não tem mutação nenhuma por trás, então é aqui que o sinal nasce.
    // Só na primeira passada do efeito — depois disso quem mudou o total foi uma mutação, que
    // já anunciou.
    if (!announcedCatchUp.current) {
      announcedCatchUp.current = true
      announcePointsDelta(points - from)
    }

    if (prefersReducedMotion()) {
      displayed.current = points
      setShown(points)
      persistBaseline(userId, month, points)
      return undefined
    }

    // O passo vive no closure do efeito, não dentro do `setShown`: um updater com efeito
    // colateral é impuro, e o React o invoca duas vezes em modo estrito.
    let step = 0
    const timer = setInterval(() => {
      step += 1
      const value = pointsTotalAt(from, points, step)
      displayed.current = value
      setShown(value)
      if (step >= POINTS_DELTA_STEPS) {
        clearInterval(timer)
        // A baseline só avança quando a contagem terminou: se o usuário fecha a aba no meio,
        // a próxima visita ainda tem o valor antigo de onde partir.
        persistBaseline(userId, month, points)
      }
    }, POINTS_DELTA_STEP_MS)

    return () => clearInterval(timer)
  }, [points, userId, month])

  return (
    <span data-testid="points-total" aria-live="polite" suppressHydrationWarning>
      {shown}
    </span>
  )
}

/**
 * De onde o contador começa, na montagem.
 *
 * Com mês: a baseline mensal manda. É do MESMO mês → começa no valor guardado e o efeito conta
 * a distância; é de outro mês → a virada aconteceu enquanto o navegador estava fechado, e o valor
 * novo é mostrado direto (CA10). Sem baseline, primeira visita: o valor direto.
 * Sem mês: o caminho do saldo, exatamente o da DEC-58.
 */
function startingValue(
  points: number,
  userId: number | null | undefined,
  month: string | null | undefined,
): number {
  if (!month) return readLastSeenPoints(userId) ?? points
  // O zero do placar é sempre o ponto de partida, nunca um destino a contar: mostrar o valor
  // guardado e cair para 0 no efeito seguinte seria o flash de uma perda que o R13 não permite.
  if (points === 0) return 0
  const baseline = readLastSeenMonthPoints(userId)
  if (!baseline) return points
  if (baseline.month !== month) return points
  return baseline.points
}

function persistBaseline(
  userId: number | null | undefined,
  month: string | null | undefined,
  points: number,
): void {
  if (month) writeLastSeenMonthPoints(userId, month, points)
  else writeLastSeenPoints(userId, points)
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
