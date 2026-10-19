"use client"

/**
 * Feed "Atividade recente" da Home — substitui o card "Histórico de tarefas". Lê as acoes
 * mais recentes gravadas em `history` (entityType "task") pelo modulo de tarefa: quem criou,
 * moveu ou concluiu. Compacto (uma linha por acao), sem o card colapsavel que comia espaco.
 * Altura fixa com rolagem interna (dono, V6-11k): a lista cresce para dentro do quadro,
 * nunca para fora — sem isso o card vira uma monstruosidade quando os logs se acumulam.
 */
import { useTaskActivity } from "@/features/tasks/hooks/use-tasks"
import { taskStatusSentenceLabel } from "@/components/ui/status"
import { Activity, ArrowRight, CheckCircle2, Plus } from "lucide-react"

const ACTION_PHRASE: Record<string, string> = {
  CREATE: "criou",
  MOVE: "moveu",
  COMPLETE: "concluiu",
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return "agora"
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return "ontem"
  if (d < 30) return `há ${d} d`
  const mo = Math.round(d / 30)
  return `há ${mo} ${mo > 1 ? "meses" : "mês"}`
}

function actionPhrase(action: string, toStatus: string | null): string {
  if (action === "MOVE" && toStatus) {
    return `moveu para ${taskStatusSentenceLabel[toStatus as keyof typeof taskStatusSentenceLabel] ?? toStatus}`
  }
  return ACTION_PHRASE[action] ?? action
}

export function ActivityFeed() {
  const { data, isPending } = useTaskActivity(12)
  const items = data ?? []

  return (
    <section aria-label="Atividade recente" className="rounded-lg border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" /> Atividade recente
      </h2>
      {isPending ? (
        <p className="py-3 text-sm text-muted-foreground">Carregando atividade…</p>
      ) : items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto divide-y divide-border pr-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/15 text-[11px] font-medium text-info">
                {initials(item.actorName)}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{item.actorName}</span>{" "}
                <span className="text-muted-foreground">{actionPhrase(item.action, item.toStatus)}</span>{" "}
                <span className="font-medium">{item.taskTitle}</span>
              </p>
              {item.action === "COMPLETE" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              ) : item.action === "CREATE" ? (
                <Plus className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{relativeTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
