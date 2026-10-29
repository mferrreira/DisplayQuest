import { cn } from "@/lib/utils/utils"

export interface ChartSegment {
  label: string
  value: number
  color: string
}

export function MiniDonutChart({
  segments,
  label,
  centerValue,
  centerLabel,
  size = 104,
  className,
}: {
  segments: ChartSegment[]
  label: string
  centerValue: string | number
  centerLabel?: string
  size?: number
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  const radius = 38
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
        {total > 0 && segments.map((segment, index) => {
          const length = (Math.max(0, segment.value) / total) * circumference
          const circle = <circle key={`${segment.label}-${index}`} cx="50" cy="50" r={radius} fill="none" stroke={segment.color} strokeWidth="12" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />
          offset += length
          return circle
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
        <span className="text-lg font-semibold tabular-nums leading-none">{centerValue}</span>
        {centerLabel && <span className="mt-1 max-w-16 text-[10px] leading-tight text-muted-foreground">{centerLabel}</span>}
      </div>
    </div>
  )
}

export function StackedBarChart({
  segments,
  label,
  className,
}: {
  segments: ChartSegment[]
  label: string
  className?: string
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0)
  return (
    <div className={cn("flex h-3 w-full overflow-hidden rounded-full bg-muted", className)} role="img" aria-label={label}>
      {total > 0 && segments.map((segment, index) => (
        <span
          key={`${segment.label}-${index}`}
          title={`${segment.label}: ${segment.value}`}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${Math.max(0, segment.value) / total * 100}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  )
}

export function WeeklyBarChart({
  weeks,
  label,
  className,
  formatValue = (value: number) => String(value),
  valueNoun = "tarefas concluídas",
}: {
  weeks: Array<{ weekStart: string; weekEnd: string; label: string; count: number }>
  label: string
  className?: string
  /** Formata o número exibido e o do título; o default preserva o rótulo antigo. */
  formatValue?: (value: number) => string
  /** O que a barra mede — "tarefas concluídas" no quadro, "horas trabalhadas" nas horas. */
  valueNoun?: string
}) {
  const max = Math.max(1, ...weeks.map((week) => week.count))
  return (
    <div role="img" aria-label={label} className={cn("grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8", className)}>
      {weeks.map((week) => (
        <div key={week.weekStart} className="flex min-w-0 flex-col items-center gap-1.5" title={`${week.weekStart} a ${week.weekEnd}: ${formatValue(week.count)} ${valueNoun}`}>
          <span className="text-xs font-medium tabular-nums">{formatValue(week.count)}</span>
          <div className="flex h-16 w-full items-end overflow-hidden rounded-t-sm bg-muted/60" aria-hidden="true">
            <span className="min-h-0.5 w-full rounded-t-sm bg-primary" style={{ height: `${week.count ? Math.max(8, week.count / max * 100) : 2}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">{week.label}</span>
        </div>
      ))}
    </div>
  )
}
