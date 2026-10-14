"use client"

/**
 * CronogramaEditor — a grade meses × atividades e a lista de metas (V5-5, DEC-100/126/151).
 *
 * É o mesmo componente em dois lugares: o painel do detalhe do projeto (persistindo a cada
 * ação) e o passo opcional do wizard de criação (guardando em estado local até o projeto
 * nascer). Ele não fala com o servidor e não decide regra: quem marca mês é
 * `toggleActivityMonthRange` do domínio — a MESMA função que a rota usa. Um clone da aritmética
 * na tela é o defeito que a DEC-90 registrou (tela/mock que reimplementa a regra fica verde com
 * a produção mentindo).
 *
 * A grade é a forma da brochura (seção 15: "Marque com X os meses correspondentes às
 * Atividades"). As colunas vêm de fora (`cronogramaMonthColumns`, DEC-151): o período do
 * projeto, ou 12 meses a partir do mês atual quando o projeto não tem datas.
 *
 * `phase` existe por causa do teclado: o input controlado dispara a cada tecla, e um PATCH por
 * tecla seria o formulário escrevendo o banco 20 vezes. `"typing"` atualiza só o estado de quem
 * segura a linha; `"commit"` (blur) é onde o painel decide o que mudou e escreve.
 */

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import {
  ACTIVITY_REWARD_PER_MONTH,
  ACTIVITY_STATUS_LABELS,
  activityReward,
  countActivityMonths,
  monthColumnLabel,
  monthKeysBetween,
} from "@/backend/domain"

/** Sentinela do Select: o Radix não aceita `""` como valor (medido no V5-4a). */
export const NO_RESPONSIBLE = "none"

export type CronogramaEditPhase = "typing" | "commit"

export interface CronogramaGoalRow {
  /** `null` é a linha que ainda não foi criada — existe só no rascunho. */
  id: number | null
  order: number
  description: string
  /** Texto do input: vazio é "sem número", não zero. */
  target: string
}

export interface CronogramaActivityRow {
  id: number | null
  order: number
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
  status?: string
}

export interface CronogramaMemberOption {
  id: number
  name: string
}

export interface CronogramaEditorProps {
  /** As colunas da grade (DEC-151). */
  months: string[]
  goals: CronogramaGoalRow[]
  activities: CronogramaActivityRow[]
  memberOptions: CronogramaMemberOption[]
  /** Data civil de hoje, a do servidor: marca a coluna do mês corrente. */
  today: string
  /** `false` esconde os controles de escrita; quem pode escrever é o servidor que decide (DEC-92). */
  canManage?: boolean
  onAddGoal: () => void
  onGoalChange: (
    goal: CronogramaGoalRow,
    patch: { description?: string; target?: string },
    phase: CronogramaEditPhase,
  ) => void
  onDeleteGoal: (goal: CronogramaGoalRow) => void
  onAddActivity: () => void
  onActivityChange: (
    activity: CronogramaActivityRow,
    patch: { description?: string; responsibleId?: number | null },
    phase: CronogramaEditPhase,
  ) => void
  onToggleMonth: (activity: CronogramaActivityRow, monthKey: string) => void
  onDeleteActivity: (activity: CronogramaActivityRow) => void
}

export function CronogramaEditor({
  months,
  goals,
  activities,
  memberOptions,
  today,
  canManage = true,
  onAddGoal,
  onGoalChange,
  onDeleteGoal,
  onAddActivity,
  onActivityChange,
  onToggleMonth,
  onDeleteActivity,
}: CronogramaEditorProps) {
  const currentMonth = today.slice(0, 7)

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Metas do projeto</Label>
          {canManage ? (
            <Button type="button" variant="outline" size="sm" onClick={onAddGoal}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar meta
            </Button>
          ) : null}
        </div>

        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma meta ainda. Meta é o objetivo do projeto; o cronograma abaixo é o quando.
          </p>
        ) : (
          <ul className="grid gap-2">
            {goals.map((goal) => (
              <li key={goal.id ?? `novo-${goal.order}`} className="flex items-center gap-2">
                <span className="w-6 text-xs text-muted-foreground">{goal.order}</span>
                <Input
                  value={goal.description}
                  aria-label={`Descrição da meta ${goal.order}`}
                  placeholder="Ex.: Elaborar a revisão da literatura"
                  disabled={!canManage}
                  onChange={(event) =>
                    onGoalChange(goal, { description: event.target.value }, "typing")
                  }
                  onBlur={() => onGoalChange(goal, {}, "commit")}
                />
                <Input
                  type="number"
                  min={1}
                  max={9999}
                  value={goal.target}
                  aria-label={`Meta numérica da meta ${goal.order}`}
                  placeholder="Nº"
                  className="w-24"
                  disabled={!canManage}
                  onChange={(event) => onGoalChange(goal, { target: event.target.value }, "typing")}
                  onBlur={() => onGoalChange(goal, {}, "commit")}
                />
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Apagar meta ${goal.order}`}
                    onClick={() => onDeleteGoal(goal)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Cronograma</Label>
          {canManage ? (
            <Button type="button" variant="outline" size="sm" onClick={onAddActivity}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar atividade
            </Button>
          ) : null}
        </div>

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade. Cada linha é uma etapa, e a duração é a contagem dos meses marcados
            — {ACTIVITY_REWARD_PER_MONTH} pontos por mês.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Atividade</TableHead>
                  {months.map((month) => (
                    <TableHead
                      key={month}
                      className="px-1 text-center text-xs"
                      aria-current={month === currentMonth ? "date" : undefined}
                    >
                      {monthColumnLabel(month)}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[160px]">Responsável</TableHead>
                  <TableHead className="text-center">Recompensa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => {
                  const marked = new Set(monthKeysBetween(activity.firstMonth, activity.lastMonth))
                  const reward = activityReward(activity.firstMonth, activity.lastMonth)
                  const markedMonths = countActivityMonths(activity.firstMonth, activity.lastMonth)
                  const statusLabel = activity.status
                    ? ACTIVITY_STATUS_LABELS[activity.status as keyof typeof ACTIVITY_STATUS_LABELS] ??
                      activity.status
                    : null

                  return (
                    <TableRow key={activity.id ?? `novo-${activity.order}`}>
                      <TableCell className="min-w-[220px]">
                        <Input
                          value={activity.description}
                          aria-label={`Descrição da atividade ${activity.order}`}
                          placeholder="Ex.: Revisão sistemática da literatura"
                          disabled={!canManage}
                          onChange={(event) =>
                            onActivityChange(activity, { description: event.target.value }, "typing")
                          }
                          onBlur={() => onActivityChange(activity, {}, "commit")}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {monthColumnLabel(activity.firstMonth)} → {monthColumnLabel(activity.lastMonth)}
                          {" · "}
                          {markedMonths} {markedMonths === 1 ? "mês" : "meses"}
                        </p>
                      </TableCell>

                      {months.map((month) => {
                        const isMarked = marked.has(month)
                        return (
                          <TableCell key={month} className="px-1 text-center">
                            <button
                              type="button"
                              aria-label={`${monthColumnLabel(month)} — atividade ${activity.order}`}
                              aria-pressed={isMarked}
                              disabled={!canManage}
                              onClick={() => onToggleMonth(activity, month)}
                              className={`h-7 w-7 rounded-md border text-xs ${
                                isMarked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {isMarked ? "X" : ""}
                            </button>
                          </TableCell>
                        )
                      })}

                      <TableCell className="min-w-[160px]">
                        <Select
                          value={
                            activity.responsibleId === null ? NO_RESPONSIBLE : String(activity.responsibleId)
                          }
                          disabled={!canManage}
                          onValueChange={(value) =>
                            onActivityChange(
                              activity,
                              { responsibleId: value === NO_RESPONSIBLE ? null : Number(value) },
                              "commit",
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-9"
                            aria-label={`Responsável da atividade ${activity.order}`}
                          >
                            <SelectValue placeholder="Sem responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_RESPONSIBLE}>Sem responsável</SelectItem>
                            {memberOptions.map((member) => (
                              <SelectItem key={member.id} value={String(member.id)}>
                                {member.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant="secondary">{reward} pts</Badge>
                        {statusLabel ? (
                          <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Apagar atividade ${activity.order}`}
                            onClick={() => onDeleteActivity(activity)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Clique num mês para marcar. A linha é sempre contínua: clicar depois do último estende,
          clicar no último desmarca, e a recompensa é {ACTIVITY_REWARD_PER_MONTH} pontos por mês
          marcado.
        </p>
      </section>
    </div>
  )
}