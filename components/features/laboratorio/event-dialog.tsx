"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface LabEventDialogValues {
  /** "yyyy-MM-dd" — filled in edit mode (move the event to another day). */
  date: string
  /** "HH:mm" — kept as the event's time of day. */
  time: string
  note: string
}

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  initialValues?: LabEventDialogValues
  error?: string | null
  saving?: boolean
  /** Callers own error handling and must not reject (fixes legacy unhandled rejection). */
  onSave: (values: LabEventDialogValues) => Promise<void> | void
}

export function EventDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  error,
  saving = false,
  onSave,
}: EventDialogProps) {
  const [date, setDate] = useState("")
  const [time, setTime] = useState("08:00")
  const [note, setNote] = useState("")

  // Capture the initial values at the moment the dialog opens so that the
  // fields are NOT reset again on subsequent parent re-renders (which can
  // happen every second due to the active responsibility timer).
  const initialValuesRef = useRef(initialValues)

  useEffect(() => {
    if (open) {
      initialValuesRef.current = initialValues
    }
  }, [open, initialValues])

  useEffect(() => {
    if (open) {
      const vals = initialValuesRef.current
      setDate(vals?.date ?? format(new Date(), "yyyy-MM-dd"))
      setTime(vals?.time ?? "08:00")
      setNote(vals?.note ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open])

  const handleSave = async () => {
    // saving state is controlled by the parent (mutation isPending)
    await onSave({ date, time, note })
  }

  const canSubmit = Boolean(note.trim()) && Boolean(time) && (!mode || mode === "create" || Boolean(date))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar Evento" : "Adicionar Evento"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Altere a data, o horário ou a descrição do evento."
              : "Preencha os dados do novo evento da agenda."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "edit" ? (
            <div className="space-y-1">
              <Label htmlFor="event-date">Data</Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-44"
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="event-time">Horário</Label>
            <Input
              id="event-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="event-note">Descrição</Label>
            <Textarea
              id="event-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descreva o evento"
              rows={4}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSubmit}>
            {mode === "edit" ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}