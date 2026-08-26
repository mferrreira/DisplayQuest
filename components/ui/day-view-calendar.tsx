import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEFAULT_SLOTS = ["07:30", "09:30", "13:30", "15:50", "17:30", "19:30"];

/**
 * Janela visível de slots do dia. Com muitos horários cadastrados (limites de
 * escalas distantes dos eventos), limita a janela ao intervalo entre o
 * primeiro e o último evento/horário relevante (± 1 slot), para não renderizar
 * uma tabela longa e vazia.
 */
export function getVisibleSlots(
  events: { time: string }[],
  labSchedules?: { startTime: string; endTime: string }[],
): string[] {
  const all = Array.from(
    new Set([
      ...DEFAULT_SLOTS,
      ...events.map((e) => e.time),
      ...(labSchedules ? labSchedules.flatMap((s) => [s.startTime, s.endTime]) : []),
    ]),
  ).sort();

  if (all.length <= 14 || events.length === 0) return all;

  const relevantTimes = [
    ...events.map((e) => e.time),
    ...(labSchedules ?? []).flatMap((s) => [s.startTime, s.endTime]),
  ].sort();

  const min = relevantTimes[0];
  const max = relevantTimes[relevantTimes.length - 1];
  const minIdx = Math.max(0, all.indexOf(min) - 1);
  const maxIdx = Math.min(all.length - 1, all.lastIndexOf(max) + 1);

  return all.slice(minIdx, maxIdx + 1);
}

export interface DayViewEvent {
  id?: number;
  time: string; // "HH:mm"
  note?: string;
  userId?: number;
  userName?: string;
  projectName?: string;
  type?: "log" | "responsibility" | "laboratory" | "event";
}

interface DayViewCalendarProps {
  date: Date;
  events: DayViewEvent[];
  labSchedules?: { startTime: string; endTime: string }[];
  onAddEvent: (time: string) => void;
  onAddEventFromHeader?: () => void;
  onDeleteEvent?: (event: DayViewEvent) => void;
  canAddEvent?: boolean;
  canDeleteEvent?: (event: DayViewEvent) => boolean;
  onDateChange: (date: Date) => void;
}

const typeColor: Record<string, string> = {
  log: "bg-blue-500 dark:bg-blue-400",
  responsibility: "bg-green-500 dark:bg-green-400",
  laboratory: "bg-purple-500 dark:bg-purple-400",
  event: "bg-amber-500 dark:bg-amber-400",
};

const DayViewCalendar: React.FC<DayViewCalendarProps> = ({
  date,
  events,
  labSchedules,
  onAddEvent,
  onAddEventFromHeader,
  onDeleteEvent,
  canAddEvent = false,
  canDeleteEvent,
  onDateChange,
}) => {
  const visibleSlots = useMemo(() => getVisibleSlots(events, labSchedules), [events, labSchedules]);

  const handlePrevDay = () => {
    const prev = new Date(date);
    prev.setDate(date.getDate() - 1);
    onDateChange(prev);
  };
  const handleNextDay = () => {
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    onDateChange(next);
  };

  return (
    <div className="w-full rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={handlePrevDay} aria-label="Dia anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-semibold text-lg capitalize">
          {date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
        <Button variant="ghost" size="icon" onClick={handleNextDay} aria-label="Próximo dia">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {canAddEvent && onAddEventFromHeader ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={onAddEventFromHeader}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar evento
          </Button>
        </div>
      ) : null}
      <div className="divide-y divide-border">
        {visibleSlots.map((slot) => {
          const event = events.find((e) => e.time === slot);
          return (
            <div key={slot} className="flex items-center py-3">
              <div className="w-16 text-right pr-4 text-muted-foreground font-mono">{slot}</div>
              {event ? (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${typeColor[event.type ?? "log"]}`} />
                  <div className="flex-1 min-w-0">
                    <span>{event.note}</span>
                    {event.userName && event.type !== "laboratory" && (
                      <div className="text-xs text-muted-foreground">
                        {event.userName}
                        {event.projectName && ` • ${event.projectName}`}
                      </div>
                    )}
                  </div>
                  {onDeleteEvent && canDeleteEvent?.(event) ? (
                    <button
                      type="button"
                      onClick={() => onDeleteEvent(event)}
                      aria-label="Remover evento"
                      title="Remover evento"
                      className="rounded p-1 text-muted-foreground opacity-60 transition hover:text-destructive hover:opacity-100 focus-visible:opacity-100 focus-visible:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ) : canAddEvent ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => onAddEvent(slot)}
                  title="Adicionar evento neste horário"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Adicionar evento
                </Button>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DayViewCalendar; 
