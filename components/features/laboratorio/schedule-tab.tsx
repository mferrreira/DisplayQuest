"use client"

import { useEffect, useMemo, useState } from "react"
import { format, isSameDay } from "date-fns"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarIcon } from "lucide-react"
import DayViewCalendar from "@/components/ui/day-view-calendar"
import { LaboratorySchedule } from "@/components/features/laboratory-schedule"
import { ScheduleGrid } from "@/components/admin/ScheduleGrid"
import { EventDialog } from "@/components/features/laboratorio/event-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { hasAccess } from "@/lib/utils/utils"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useLabEvents } from "@/contexts/lab-events-context"
import { useLaboratorySchedule } from "@/contexts/laboratory-schedule-context"
import { canManageTargetEvent } from "@/components/features/laboratorio/permissions"
import type { DayViewEvent } from "@/components/ui/day-view-calendar"

interface ScheduleTabProps {
  labUsersLoading: boolean
}

export function ScheduleTab({ labUsersLoading }: ScheduleTabProps) {
  const { user } = useAuth()
  const { users: labUsers } = useUser()
  const { schedules: labSchedules } = useLaboratorySchedule()
  const { events: labEvents, fetchEvents, createEvent, deleteEvent } = useLabEvents()
  const canAddEvents = hasAccess(user?.roles || [], "VIEW_ALL_DATA")

  const [date, setDate] = useState<Date>(new Date())
  const [showEventDialog, setShowEventDialog] = useState(false)
  const [eventDialogTime, setEventDialogTime] = useState<string | undefined>(undefined)
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<DayViewEvent | null>(null)

  useEffect(() => {
    fetchEvents(date)
  }, [date, fetchEvents])

  // Build events for the selected day (only lab events posted by users)
  const events: DayViewEvent[] = useMemo(() => {
    return labEvents
      .filter((event) => {
        const eventDate = new Date(event.date)
        return eventDate.toDateString() === date.toDateString()
      })
      .map((event) => ({
        id: event.id,
        time: new Date(event.date).toTimeString().slice(0, 5),
        note: event.note,
        type: "event" as const,
        userId: event.userId,
        userName: event.userName,
      }))
  }, [labEvents, date])

  const handleSaveEvent = async (time: string, note: string) => {
    if (!user) return
    const eventDate = new Date(date)
    const [h, m] = time.split(":").map(Number)
    eventDate.setHours(h, m, 0, 0)
    await createEvent({ date: eventDate.toISOString(), note })
    setShowEventDialog(false)
  }

  const openNewEventDialog = (time?: string) => {
    const defaultTime =
      time ?? (isSameDay(date, new Date()) ? format(new Date(), "HH:mm") : "08:00")
    setEventDialogTime(defaultTime)
    setShowEventDialog(true)
  }

  const handleDeleteEvent = async () => {
    const event = pendingDeleteEvent
    if (!event?.id || !canManageTargetEvent(user, labUsers, event.userId)) return
    await deleteEvent(event.id)
    setPendingDeleteEvent(null)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Agenda do Dia</CardTitle>
            <CardDescription>
              {hasAccess(user?.roles || [], "VIEW_ALL_DATA")
                ? "Slots padrão e eventos do dia selecionado. Clique em '+ Adicionar evento' para registrar um log ou responsabilidade."
                : "Visualize a agenda e eventos do laboratório."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DayViewCalendar
              date={date}
              events={events}
              labSchedules={labSchedules}
              canAddEvent={canAddEvents}
              onAddEventFromHeader={() => openNewEventDialog()}
              onAddEvent={(slot) => {
                if (!canAddEvents) return
                openNewEventDialog(slot)
              }}
              onDeleteEvent={(event) => setPendingDeleteEvent(event)}
              canDeleteEvent={(event) => canManageTargetEvent(user, labUsers, event.userId)}
              onDateChange={setDate}
            />
          </CardContent>
        </Card>

        <Card>
          <LaboratorySchedule />
        </Card>
      </div>

      {labUsersLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-6 text-muted-foreground">
            Carregando grade semanal...
          </CardContent>
        </Card>
      ) : (
        <ScheduleGrid users={labUsers} currentUser={user || undefined} />
      )}

      <EventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        defaultTime={eventDialogTime}
        onSave={handleSaveEvent}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteEvent)}
        onOpenChange={(open) => !open && setPendingDeleteEvent(null)}
        title="Remover evento"
        description={`Remover o evento "${pendingDeleteEvent?.note || "sem descrição"}"?`}
        confirmLabel="Remover"
        destructive
        onConfirm={handleDeleteEvent}
      />
    </div>
  )
}
