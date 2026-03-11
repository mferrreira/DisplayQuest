import React, { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";

const DEFAULT_SLOTS = ["07:30", "09:30", "13:30", "15:50", "17:30", "19:30"];
function getVisibleSlots(events: { time: string }[], labSchedules?: { startTime: string; endTime: string }[]) {
  const eventSlots = events.map(e => e.time);
  const labSlots = labSchedules ? labSchedules.flatMap(s => [s.startTime, s.endTime]) : [];
  return Array.from(new Set([...DEFAULT_SLOTS, ...eventSlots, ...labSlots])).sort();
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
  log: "bg-blue-500",
  responsibility: "bg-green-500",
  laboratory: "bg-purple-500",
  event: "bg-amber-500",
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
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 w-full max-w-md mx-auto border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrevDay} className="text-blue-600 dark:text-blue-400 hover:underline px-2 py-1">◀</button>
        <span className="font-semibold text-lg text-gray-900 dark:text-gray-100">{date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</span>
        <button onClick={handleNextDay} className="text-blue-600 dark:text-blue-400 hover:underline px-2 py-1">▶</button>
      </div>
      {canAddEvent && onAddEventFromHeader ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onAddEventFromHeader}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Adicionar evento
          </button>
        </div>
      ) : null}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {visibleSlots.map((slot) => {
          const event = events.find(e => e.time === slot);
          return (
            <div key={slot} className="flex items-center py-3 group">
              <div className="w-16 text-right pr-4 text-gray-800 dark:text-gray-300 font-mono">{slot}</div>
              {event ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${typeColor[event.type ?? "log"]}`} />
                  <div className="flex-1">
                    <span className="text-gray-900 dark:text-gray-100">
                      {event.note}
                    </span>
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
                      className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      title="Remover evento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ) : canAddEvent ? (
                <button
                  className="ml-2 text-sm text-blue-600 dark:text-blue-400 hover:underline opacity-0 group-hover:opacity-100 transition"
                  onClick={() => onAddEvent(slot)}
                  title="Adicionar evento neste horário"
                >
                  + Adicionar evento
                </button>
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
