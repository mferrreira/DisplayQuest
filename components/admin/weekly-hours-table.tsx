"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils/utils"

interface WeeklyHoursTableUser {
  id: number
  name: string
  email: string
  weekHours?: number | null
}

interface WeeklyHoursTableProps {
  users: WeeklyHoursTableUser[]
  /** Sessões concluídas de todo o laboratório (o admin pagina via WorkSessionsAPI). */
  sessions: Array<{
    userId: number
    status?: string
    startTime?: string | null
    duration?: number | null
  }>
}

interface WeeklyHistoryEntry {
  userId: number
  userName: string
  totalHours: number
}

function mondayOf(date: Date) {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * Quadro de horas por usuário e por SEMANA — reconstrução do quadro antigo
 * (UserWeeklyHoursTable, apagado em 7f2bafe no V6-9), pedido do dono:
 * histórico de semanas trabalhadas com navegador (‹ Hoje ›) e a coluna de estado
 * ("Y h restantes" / "+X h extra" / "Meta atingida!" / "Sem meta definida") contra a
 * meta semanal da pessoa (`users.weekHours`).
 *
 * A semana atual é calculada ao vivo pelas sessões concluídas em memória; as semanas
 * passadas leem o histórico do servidor (GET /api/weekly-hours-history?weekStart=…).
 * Quando o cron semanal ainda não gravou uma semana passada, o quadro tenta
 * criar o histórico (POST action create_week_history) e relê — o mesmo fallback
 * do quadro antigo.
 */
export function WeeklyHoursTable({ users, sessions }: WeeklyHoursTableProps) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [history, setHistory] = useState<WeeklyHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const isCurrentWeek = useMemo(() => {
    return weekStart.getTime() === mondayOf(new Date()).getTime()
  }, [weekStart])

  useEffect(() => {
    if (isCurrentWeek) {
      setHistory([])
      return
    }

    let cancelled = false

    async function loadHistory() {
      setLoading(true)
      try {
        let data = await requestHistory(weekStart)
        // Fallback do quadro antigo: cron não rodou para essa semana → pedir a criação.
        if ((!data.history || data.history.length === 0) && !cancelled) {
          const createResponse = await fetch("/api/weekly-hours-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_week_history", weekStart: weekStart.toISOString() }),
          })
          if (createResponse.ok) {
            data = await requestHistory(weekStart)
          }
        }
        if (!cancelled) setHistory(Array.isArray(data.history) ? data.history : [])
      } catch {
        if (!cancelled) setHistory([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [weekStart, isCurrentWeek])

  function getUserHours(userId: number) {
    if (isCurrentWeek) {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      return sessions
        .filter((session) =>
          session.status === "completed" &&
          session.userId === userId &&
          session.startTime &&
          new Date(session.startTime) >= weekStart &&
          new Date(session.startTime) <= weekEnd)
        .reduce((total, session) => total + (session.duration || 0) / 3600, 0)
    }
    return history.find((entry) => entry.userId === userId)?.totalHours ?? 0
  }

  function estado(expected: number, horas: number) {
    const diff = expected - horas
    if (expected === 0) return { text: "Sem meta definida", className: "text-muted-foreground" }
    if (diff > 0) return { text: `${diff.toFixed(1)}h restantes`, className: "font-medium text-destructive" }
    if (diff < 0) return { text: `+${Math.abs(diff).toFixed(1)}h extra`, className: "font-medium text-success" }
    return { text: "Meta atingida!", className: "font-medium text-info" }
  }

  const weekTitle = isCurrentWeek
    ? "Semana atual"
    : `${weekStart.toLocaleDateString("pt-BR")} - ${new Date(new Date(weekStart).setDate(weekStart.getDate() + 6)).toLocaleDateString("pt-BR")}`

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
          Horas por usuário · {weekTitle}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((week) => new Date(new Date(week).setDate(week.getDate() - 7)))}
            disabled={loading}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(mondayOf(new Date()))}
            disabled={loading || isCurrentWeek}
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((week) => new Date(new Date(week).setDate(week.getDate() + 7)))}
            disabled={loading}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Horas trabalhadas</TableHead>
            <TableHead className="text-right">Meta</TableHead>
            <TableHead className="text-right">Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                Carregando dados da semana...
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => {
              const horas = getUserHours(user.id)
              const meta = user.weekHours || 0
              const estadoCelula = estado(meta, horas)
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{horas.toFixed(1)} h</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{meta.toFixed(1)} h</TableCell>
                  <TableCell className={cn("text-right tabular-nums", estadoCelula.className)}>{estadoCelula.text}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

async function requestHistory(weekStart: Date) {
  const response = await fetch(`/api/weekly-hours-history?weekStart=${weekStart.toISOString()}`)
  if (!response.ok) return { history: [] }
  return response.json()
}
