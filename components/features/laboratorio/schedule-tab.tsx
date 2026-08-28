"use client"

import { useMemo, useState } from "react"
import { format, isSameDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import DayViewCalendar from "@/components/ui/day-view-calendar"
import { LaboratorySchedule } from "@/components/features/laboratory-schedule"
import { ScheduleGrid } from "@/components/admin/ScheduleGrid"
import {
  EventDialog,
  type LabEventDialogValues,
} from "@/components/features/laboratorio/event-dialog"
import { EventDetailDialog } from "@/components/features/laboratorio/event-detail-dialog"
import { UpcomingEventsDialog } from "@/features/lab-schedule/components/upcoming-events-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { hasAccess } from "@/lib/utils/utils"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useLaboratorySchedule } from "@/contexts/laboratory-schedule-context"
import { useLabEventsForDay, useLabEventMutations } from "@/features/lab-schedule/hooks/use-lab-events"
import { canManageTargetEvent } from "@/components/features/laboratorio/permissions"
import type { DayViewEvent } from "@/components/ui/day-view-calendar"
import type { LabEvent } from "@/entities/lab"

interface ScheduleTabProps {
  labUsersLoading: boolean
}

export function ScheduleTab({ labUsersLoading }: ScheduleTabProps) {
  const { user } = useAuth()
  const { users: labUsers } = useUser()
  const { schedules: labSchedules } = useLaboratorySchedule()
  const canAddEvents = hasAccess(user?.roles || [], "VIEW_ALL_DATA")

  const [date, setDate] = useState<Date>(new Date())
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createTime, setCreateTime] = useState<string | undefined>(undefined)
  const [createError, setCreateError] = useState<string | null>(null)
  const [viewEvent, setViewEvent] = useState<LabEvent | null>(null)
  const [editEvent, setEditEvent] = useState<LabEvent | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<DayViewEvent | null>(null)

  const dayEventsQuery = useLabEventsForDay(date)
  const { create, update, remove } = useLabEventMutations()

  // Build events for the selected day (only lab events posted by users)
  const dayEvents: DayViewEvent[] = useMemo(() => {
    return (dayEventsQuery.data ?? [])
      .filter((event) => new Date(event.date).toDateString() === date.toDateString())
      .map((event) => ({
        id: event.id,
        time: new Date(event.date).toTimeString().slice(0, 5),
        note: event.note,
        type: "event" as const,
        userId: event.userId,
        userName: event.userName,
      }))
  }, [dayEventsQuery.data, date])

  const findFullEvent = (event: DayViewEvent): LabEvent | undefined =>
    (dayEventsQuery.data ?? []).find((e) => e.id === event.id)

  const openNewEventDialog = (time?: string) => {
    const defaultTime =
      time ?? (isSameDay(date, new Date()) ? format(new Date(), "HH:mm") : "08:00")
    setCreateTime(defaultTime)
    setCreateError(null)
    setShowCreateDialog(true)
  }

  const handleCreateEvent = async ({ date: day, time, note }: LabEventDialogValues) => {
    if (!user || !canAddEvents) {
      setCreateError("Você não tem permissão para criar eventos")
      return
    }
    setCreateError(null)
    try {
      const eventDate = new Date(`${day}T${time}`)
      await create.mutateAsync({ date: eventDate.toISOString(), note })
      setShowCreateDialog(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Erro ao criar evento do laboratório")
    }
  }

  const handleViewEvent = (event: DayViewEvent) => {
    const full = findFullEvent(event)
    if (full) setViewEvent(full)
  }

  const handleEditFromRow = (event: DayViewEvent) => {
    const full = findFullEvent(event)
    if (full) {
      setUpdateError(null)
      setEditEvent(full)
    }
  }

  const handleEditFromDetail = (event: LabEvent) => {
    setViewEvent(null)
    setUpdateError(null)
    setEditEvent(event)
  }

  const editInitialValues: LabEventDialogValues | undefined = editEvent
    ? {
        date: format(new Date(editEvent.date), "yyyy-MM-dd"),
        time: new Date(editEvent.date).toTimeString().slice(0, 5),
        note: editEvent.note,
      }
    : undefined

  const handleUpdateEvent = async ({ date: day, time, note }: LabEventDialogValues) => {
    if (!user || !editEvent) return
    if (!canManageTargetEvent(user, labUsers, editEvent.userId)) {
      setUpdateError("Você não tem permissão para editar este evento")
      return
    }
    setUpdateError(null)
    try {
      const eventDate = new Date(`${day}T${time}`)
      await update.mutateAsync({ id: editEvent.id, body: { date: eventDate.toISOString(), note } })
      setEditEvent(null)
      setUpdateError(null)
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Erro ao atualizar evento do laboratório")
    }
  }

  const handleDeleteEvent = async () => {
    const event = pendingDeleteEvent
    if (!event?.id || !canManageTargetEvent(user, labUsers, event.userId)) return
    try {
      await remove.mutateAsync(event.id)
      setPendingDeleteEvent(null)
    } catch {
      // keep the confirm dialog open so the user can retry or cancel
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Agenda do Dia</CardTitle>
                <CardDescription>
                  {canAddEvents
                    ? "Slots padrão e eventos do dia selecionado. Clique em '+ Adicionar evento' para registrar um log ou responsabilidade."
                    : "Visualize a agenda e eventos do laboratório."}
                </CardDescription>
              </div>
              <UpcomingEventsDialog onSelectDay={setDate} />
            </div>
          </CardHeader>
          <CardContent>
            {dayEventsQuery.isError ? (
              <div className="flex flex-col items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive sm:flex-row">
                <span>Não foi possível carregar os eventos do dia.</span>
                <Button variant="outline" size="sm" onClick={() => dayEventsQuery.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <DayViewCalendar
                date={date}
                events={dayEvents}
                labSchedules={labSchedules}
                canAddEvent={canAddEvents}
                onAddEventFromHeader={() => openNewEventDialog()}
                onAddEvent={(slot) => {
                  if (!canAddEvents) return
                  openNewEventDialog(slot)
                }}
                onViewEvent={handleViewEvent}
                onEditEvent={handleEditFromRow}
                canEditEvent={(event) => canManageTargetEvent(user, labUsers, event.userId)}
                onDeleteEvent={(event) => setPendingDeleteEvent(event)}
                canDeleteEvent={(event) => canManageTargetEvent(user, labUsers, event.userId)}
                onDateChange={setDate}
              />
            )}
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
        open={showCreateDialog}
        onOpenChange={(open) => !open && setShowCreateDialog(false)}
        mode="create"
        initialValues={{
          date: format(date, "yyyy-MM-dd"),
          time: createTime ?? (isSameDay(date, new Date()) ? format(new Date(), "HH:mm") : "08:00"),
          note: "",
        }}
        error={createError}
        saving={create.isPending}
        onSave={handleCreateEvent}
      />

      <EventDialog
        open={Boolean(editEvent)}
        onOpenChange={(open) => !open && setEditEvent(null)}
        mode="edit"
        initialValues={editInitialValues}
        error={updateError}
        saving={update.isPending}
        onSave={handleUpdateEvent}
      />

      <EventDetailDialog
        open={Boolean(viewEvent)}
        onOpenChange={(open) => !open && setViewEvent(null)}
        event={viewEvent}
        canEdit={viewEvent ? canManageTargetEvent(user, labUsers, viewEvent.userId) : false}
        onEdit={handleEditFromDetail}
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