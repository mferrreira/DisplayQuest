"use client"

/**
 * "Próximos eventos" as a modal over the agenda (2026-08-28). The icon button
 * lives in the "Agenda do Dia" CardHeader; on click it opens a centered Dialog
 * — one behavior for mobile and desktop. The 14-day fetch is lazy: it only
 * fires on the first open (see `useUpcomingLabEvents(days, enabled)`).
 * Selecting a row jumps the agenda to that day and closes the dialog.
 */
import { useState } from "react"
import { format, isToday } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { UPCOMING_DAYS, useUpcomingLabEvents } from "@/features/lab-schedule/hooks/use-lab-events"

interface UpcomingEventsDialogProps {
  /** Selecting a row jumps the agenda to that day and closes the dialog. */
  onSelectDay?: (date: Date) => void
  days?: number
}

export function UpcomingEventsDialog({ onSelectDay, days = UPCOMING_DAYS }: UpcomingEventsDialogProps) {
  const [open, setOpen] = useState(false)
  const { data: events = [], isLoading, isError, refetch } = useUpcomingLabEvents(days, open)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximos eventos"
          title="Próximos eventos"
          className="shrink-0"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Próximos eventos
          </DialogTitle>
          <DialogDescription>Agenda dos próximos {days} dias.</DialogDescription>
        </DialogHeader>

        <div className="-mr-4 max-h-[60vh] overflow-y-auto pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-14 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row">
              <span>Não foi possível carregar os próximos eventos.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento nos próximos {days} dias.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event) => {
                const eventDate = new Date(event.date)
                const today = isToday(eventDate)
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDay?.(eventDate)
                        setOpen(false)
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      title="Ir para este dia na agenda"
                    >
                      <div className="w-16 shrink-0 text-center">
                        <div className="text-sm font-semibold leading-tight">
                          {format(eventDate, "dd/MM")}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {format(eventDate, "EEEE", { locale: ptBR })}
                        </div>
                        {today ? (
                          <Badge variant="info" className="mt-1 px-1.5 py-0 text-[10px]">
                            hoje
                          </Badge>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{event.note}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(eventDate, "HH:mm")} • {event.userName || "Usuário"}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}